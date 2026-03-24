const express = require('express');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { authenticateToken, requireAdmin, requireTeacher } = require('../middleware/auth');
const { logActivityAsync, ACTIONS } = require('../services/activityLogger');
const {
  isS3Configured,
  validateFile,
  generateS3Key,
  uploadFile,
  getPresignedUrl,
  deleteFile,
  MAX_FILES_PER_EVALUATION,
} = require('../utils/s3');

const router = express.Router();

// Configure multer for memory storage (files stored in buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Helper function to get effective due date for a specific phase
// Uses cascading logic: if no due date for this phase, use the next phase's due date
function getEffectiveDueDate(classId, phase, numPhases, hasFinalEvaluation, phaseDueDates, timezone) {
  // phase is 1-N for regular phases, 0 for final evaluation
  // phaseDueDates is an object { phase: due_date }

  // If this phase has a due date, use it
  if (phaseDueDates[phase]) {
    return phaseDueDates[phase];
  }

  // Otherwise, look forward to find the next set date
  // For regular phases (1 to numPhases), look at higher phases
  if (phase > 0) {
    for (let p = phase + 1; p <= numPhases; p++) {
      if (phaseDueDates[p]) {
        return phaseDueDates[p];
      }
    }
    // If still no date and there's a final evaluation, check phase 0
    if (hasFinalEvaluation && phaseDueDates[0]) {
      return phaseDueDates[0];
    }
  }

  // No due date found in cascade
  return null;
}

// Helper function to check if a specific phase is past due for a user
// Also checks for individual student extensions
async function checkIfPhasePastDue(userId, phase, classId) {
  try {
    // Get the user's class info
    let classInfo;
    if (classId) {
      classInfo = await prisma.class.findUnique({
        where: { id: parseInt(classId) },
        select: {
          id: true,
          numPhases: true,
          hasFinalEvaluation: true,
          dueDateTimezone: true
        }
      });
    } else {
      const enrollment = await prisma.classEnrollment.findFirst({
        where: { userId: parseInt(userId) },
        include: {
          class: {
            select: {
              id: true,
              numPhases: true,
              hasFinalEvaluation: true,
              dueDateTimezone: true
            }
          }
        }
      });
      classInfo = enrollment?.class;
    }

    if (!classInfo) {
      return { isPastDue: false, effectiveDueDate: null };
    }

    // Convert phase parameter: 'final' becomes 0, otherwise parseInt
    const phaseNum = phase === 'final' || phase === 0 ? 0 : parseInt(phase);

    // Check for individual extension - first for this phase, then cascade to later phases
    const extensions = await prisma.studentExtension.findMany({
      where: {
        classId: classInfo.id,
        userId: parseInt(userId)
      },
      orderBy: { phase: 'desc' }
    });

    // Find applicable extension using cascade logic (like due dates)
    let extension = null;
    if (extensions && extensions.length > 0) {
      // First check for exact phase match
      const exactMatch = extensions.find(e => e.phase === phaseNum);
      if (exactMatch) {
        extension = exactMatch;
      } else if (phaseNum > 0) {
        // For numbered phases, look for extension on later phases
        for (const ext of extensions) {
          if (ext.phase > phaseNum || ext.phase === 0) {
            extension = ext;
            break;
          }
        }
      }
    }


    // Get phase due dates for this class
    const phaseDueDatesRows = await prisma.phaseDueDate.findMany({
      where: { classId: classInfo.id }
    });

    // Convert to object
    const phaseDueDates = {};
    if (phaseDueDatesRows) {
      phaseDueDatesRows.forEach(pd => {
        phaseDueDates[pd.phase] = pd.dueDate;
      });
    }

    const timezone = classInfo.dueDateTimezone || 'America/New_York';
    const numPhases = classInfo.numPhases || 3;
    const hasFinalEvaluation = classInfo.hasFinalEvaluation;

    // Determine the effective due date:
    // 1. If student has an extension, use that
    // 2. Otherwise, use the class phase due date (with cascading)
    let effectiveDueDate;
    if (extension && extension.extendedDueDate) {
      effectiveDueDate = extension.extendedDueDate;
    } else {
      effectiveDueDate = getEffectiveDueDate(
        classInfo.id,
        phaseNum,
        numPhases,
        hasFinalEvaluation,
        phaseDueDates,
        timezone
      );
    }

    if (!effectiveDueDate) {
      // No due date set for this phase (or any subsequent phase)
      return { isPastDue: false, effectiveDueDate: null };
    }

    // Get current time formatted in the target timezone
    const now = new Date();
    const nowParts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(now);

    const getPart = (parts, type) => parts.find(p => p.type === type)?.value;
    // Handle case where midnight might be formatted as "24:00" instead of "00:00"
    let hour = getPart(nowParts, 'hour');
    if (hour === '24') hour = '00';
    const nowInTz = `${getPart(nowParts, 'year')}-${getPart(nowParts, 'month')}-${getPart(nowParts, 'day')}T${hour}:${getPart(nowParts, 'minute')}`;

    // Compare as strings (both in the same timezone context)
    const isPastDue = nowInTz > effectiveDueDate;

    return { isPastDue, effectiveDueDate };
  } catch (err) {
    console.error('checkIfPhasePastDue error:', err);
    throw err;
  }
}

// Check if evaluations are past due (read-only) for a specific phase
router.get('/is-read-only', authenticateToken, async (req, res) => {
  try {
    const { phase, class_id } = req.query;

    // Teachers and admins can always edit
    if (req.user.role === 'teacher' || req.user.role === 'admin') {
      return res.json({ isReadOnly: false });
    }

    // Use phase 1 as default if not specified (backwards compatibility)
    const targetPhase = phase || 1;

    const { isPastDue, effectiveDueDate } = await checkIfPhasePastDue(req.user.id, targetPhase, class_id);

    // Get timezone from class
    let classInfo;
    if (class_id) {
      classInfo = await prisma.class.findUnique({
        where: { id: parseInt(class_id) },
        select: { dueDateTimezone: true }
      });
    } else {
      const enrollment = await prisma.classEnrollment.findFirst({
        where: { userId: req.user.id },
        include: {
          class: {
            select: { dueDateTimezone: true }
          }
        }
      });
      classInfo = enrollment?.class;
    }

    res.json({
      isReadOnly: isPastDue,
      dueDate: effectiveDueDate,
      timezone: classInfo?.dueDateTimezone || 'America/New_York'
    });
  } catch (err) {
    console.error('is-read-only error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get evaluations for current user (what they've submitted)
// Admins/teachers can pass user_id to masquerade as a student
router.get('/my-evaluations', authenticateToken, async (req, res) => {
  try {
    const { user_id, class_id } = req.query;

    // Allow admins/teachers to masquerade as a student
    const isTeacherOrAdmin = req.user.role === 'teacher' || req.user.role === 'admin';
    const targetUserId = (isTeacherOrAdmin && user_id) ? parseInt(user_id) : req.user.id;

    const where = { evaluatorId: targetUserId };
    if (class_id) {
      where.classId = parseInt(class_id);
    }

    const evaluations = await prisma.evaluation.findMany({
      where,
      include: {
        evaluatee: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: [
        { phase: 'asc' },
        { evaluatee: { lastName: 'asc' } }
      ]
    });

    res.json(evaluations.map(e => ({
      id: e.id,
      evaluator_id: e.evaluatorId,
      evaluatee_id: e.evaluateeId,
      class_id: e.classId,
      phase: e.phase,
      contribution: e.contribution,
      communication: e.communication,
      reliability: e.reliability,
      quality_of_work: e.qualityOfWork,
      collaboration: e.collaboration,
      score: e.score,
      comments: e.comments,
      created_at: e.createdAt,
      updated_at: e.updatedAt,
      evaluatee_name: `${e.evaluatee.firstName} ${e.evaluatee.lastName}`.trim()
    })));
  } catch (err) {
    console.error('my-evaluations error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get final comments for current user
// Admins/teachers can pass user_id to masquerade as a student
router.get('/my-final-comments', authenticateToken, async (req, res) => {
  try {
    const { user_id, class_id } = req.query;

    // Allow admins/teachers to masquerade as a student
    const isTeacherOrAdmin = req.user.role === 'teacher' || req.user.role === 'admin';
    const targetUserId = (isTeacherOrAdmin && user_id) ? parseInt(user_id) : req.user.id;

    const where = { evaluatorId: targetUserId };
    if (class_id) {
      where.classId = parseInt(class_id);
    }

    const comments = await prisma.finalComment.findMany({
      where,
      include: {
        evaluatee: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: {
        evaluatee: { lastName: 'asc' }
      }
    });

    res.json(comments.map(fc => ({
      id: fc.id,
      evaluator_id: fc.evaluatorId,
      evaluatee_id: fc.evaluateeId,
      class_id: fc.classId,
      comments: fc.comments,
      final_points: fc.finalPoints,
      created_at: fc.createdAt,
      updated_at: fc.updatedAt,
      evaluatee_name: `${fc.evaluatee.firstName} ${fc.evaluatee.lastName}`.trim()
    })));
  } catch (err) {
    console.error('my-final-comments error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Submit or update evaluation
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      evaluatee_id,
      phase,
      class_id,
      contribution,
      communication,
      reliability,
      quality_of_work,
      collaboration,
      score,
      comments
    } = req.body;

    // Validate phase
    if (phase < 1 || phase > 5) {
      return res.status(400).json({ error: 'Phase must be between 1 and 5' });
    }

    // Validate score
    if (score < 0 || score > 100) {
      return res.status(400).json({ error: 'Score must be between 0 and 100' });
    }

    // Check if this specific phase is past due (only for students)
    if (req.user.role === 'student') {
      const { isPastDue } = await checkIfPhasePastDue(req.user.id, phase, class_id);
      if (isPastDue) {
        return res.status(403).json({ error: `Phase ${phase} is past due and can no longer be submitted or modified` });
      }
    }

    if (!class_id) {
      return res.status(400).json({ error: 'class_id is required' });
    }

    // Check if evaluation exists
    const existing = await prisma.evaluation.findUnique({
      where: {
        evaluatorId_evaluateeId_phase_classId: {
          evaluatorId: req.user.id,
          evaluateeId: parseInt(evaluatee_id),
          phase: parseInt(phase),
          classId: parseInt(class_id)
        }
      }
    });

    if (existing) {
      // Update existing evaluation
      const updated = await prisma.evaluation.update({
        where: { id: existing.id },
        data: {
          contribution,
          communication,
          reliability,
          qualityOfWork: quality_of_work,
          collaboration,
          score,
          comments,
          updatedAt: new Date()
        }
      });

      // Log evaluation update
      logActivityAsync({
        userId: req.user.id,
        action: ACTIONS.UPDATE_EVALUATION,
        classId: class_id ? parseInt(class_id) : null,
        details: { phase, evaluatee_id },
        req
      });

      res.json({ id: updated.id, message: 'Evaluation updated' });
    } else {
      // Create new evaluation
      const created = await prisma.evaluation.create({
        data: {
          evaluatorId: req.user.id,
          evaluateeId: parseInt(evaluatee_id),
          phase: parseInt(phase),
          classId: parseInt(class_id),
          contribution,
          communication,
          reliability,
          qualityOfWork: quality_of_work,
          collaboration,
          score,
          comments
        }
      });

      // Log evaluation submission
      logActivityAsync({
        userId: req.user.id,
        action: ACTIONS.SUBMIT_EVALUATION,
        classId: class_id ? parseInt(class_id) : null,
        details: { phase, evaluatee_id },
        req
      });

      res.json({ id: created.id, message: 'Evaluation created' });
    }
  } catch (err) {
    console.error('submit evaluation error:', err);
    res.status(500).json({ error: 'Failed to save evaluation' });
  }
});

// Submit or update final comments
router.post('/final-comments', authenticateToken, async (req, res) => {
  try {
    const { evaluatee_id, comments, final_points, class_id } = req.body;

    if (!class_id) {
      return res.status(400).json({ error: 'class_id is required' });
    }

    // Check if final evaluation phase is past due (only for students)
    if (req.user.role === 'student') {
      const { isPastDue } = await checkIfPhasePastDue(req.user.id, 'final', class_id);
      if (isPastDue) {
        return res.status(403).json({ error: 'Final evaluation is past due and can no longer be submitted or modified' });
      }
    }

    // Check if final comment exists for this class
    const existing = await prisma.finalComment.findUnique({
      where: {
        evaluatorId_evaluateeId_classId: {
          evaluatorId: req.user.id,
          evaluateeId: parseInt(evaluatee_id),
          classId: parseInt(class_id)
        }
      }
    });

    if (existing) {
      // Update existing
      const updated = await prisma.finalComment.update({
        where: { id: existing.id },
        data: {
          comments,
          finalPoints: final_points || 0,
          updatedAt: new Date()
        }
      });

      // Log final comment update
      logActivityAsync({
        userId: req.user.id,
        action: ACTIONS.UPDATE_FINAL_COMMENT,
        classId: class_id ? parseInt(class_id) : null,
        details: { evaluatee_id },
        req
      });

      res.json({ id: updated.id, message: 'Final comments updated' });
    } else {
      // Create new
      const created = await prisma.finalComment.create({
        data: {
          evaluatorId: req.user.id,
          evaluateeId: parseInt(evaluatee_id),
          comments,
          finalPoints: final_points || 0,
          classId: parseInt(class_id)
        }
      });

      // Log final comment submission
      logActivityAsync({
        userId: req.user.id,
        action: ACTIONS.SUBMIT_FINAL_COMMENT,
        classId: class_id ? parseInt(class_id) : null,
        details: { evaluatee_id },
        req
      });

      res.json({ id: created.id, message: 'Final comments created' });
    }
  } catch (err) {
    console.error('submit final comments error:', err);
    res.status(500).json({ error: 'Failed to save final comments' });
  }
});

// Get all evaluations (admin sees all, teacher sees their classes only)
router.get('/all', authenticateToken, requireTeacher, async (req, res) => {
  try {
    // Build class filter for teachers
    let classFilter = {};
    if (req.user.role !== 'admin') {
      const teacherClasses = await prisma.class.findMany({
        where: { teacherId: req.user.id },
        select: { id: true }
      });
      classFilter = { classId: { in: teacherClasses.map(c => c.id) } };
    }

    const evaluations = await prisma.evaluation.findMany({
      where: classFilter,
      include: {
        evaluator: {
          select: { firstName: true, lastName: true }
        },
        evaluatee: {
          select: {
            firstName: true,
            lastName: true,
            groupMemberships: {
              include: {
                group: { select: { name: true, classId: true } }
              }
            }
          }
        },
        attachments: true
      },
      orderBy: [
        { phase: 'asc' },
        { evaluatee: { lastName: 'asc' } },
        { evaluator: { lastName: 'asc' } }
      ]
    });

    // Generate presigned URLs for attachments
    const evalsWithUrls = await Promise.all(evaluations.map(async (e) => {
      const attachmentsWithUrls = await Promise.all(
        (e.attachments || []).map(async (att) => ({
          id: att.id,
          fileName: att.fileName,
          mimeType: att.mimeType,
          fileSize: att.fileSize,
          url: await getPresignedUrl(att.s3Key),
          uploadedAt: att.uploadedAt
        }))
      );

      return {
        id: e.id,
        evaluator_id: e.evaluatorId,
        evaluatee_id: e.evaluateeId,
        class_id: e.classId,
        phase: e.phase,
        contribution: e.contribution,
        communication: e.communication,
        reliability: e.reliability,
        quality_of_work: e.qualityOfWork,
        collaboration: e.collaboration,
        score: e.score,
        comments: e.comments,
        created_at: e.createdAt,
        updated_at: e.updatedAt,
        evaluator_name: `${e.evaluator.firstName} ${e.evaluator.lastName}`.trim(),
        evaluatee_name: `${e.evaluatee.firstName} ${e.evaluatee.lastName}`.trim(),
        group_name: e.evaluatee.groupMemberships.find(gm => gm.group?.classId === e.classId)?.group?.name || null,
        attachments: attachmentsWithUrls
      };
    }));

    res.json(evalsWithUrls);
  } catch (err) {
    console.error('get all evaluations error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get all final comments (admin sees all, teacher sees their classes only)
router.get('/all-final-comments', authenticateToken, requireTeacher, async (req, res) => {
  try {
    // Build class filter for teachers
    let classFilter = {};
    if (req.user.role !== 'admin') {
      const teacherClasses = await prisma.class.findMany({
        where: { teacherId: req.user.id },
        select: { id: true }
      });
      classFilter = { classId: { in: teacherClasses.map(c => c.id) } };
    }

    const comments = await prisma.finalComment.findMany({
      where: classFilter,
      include: {
        evaluator: {
          select: { firstName: true, lastName: true }
        },
        evaluatee: {
          select: {
            firstName: true,
            lastName: true,
            groupMemberships: {
              include: {
                group: { select: { name: true, classId: true } }
              }
            }
          }
        }
      },
      orderBy: [
        { evaluatee: { lastName: 'asc' } },
        { evaluator: { lastName: 'asc' } }
      ]
    });

    res.json(comments.map(fc => ({
      id: fc.id,
      evaluator_id: fc.evaluatorId,
      evaluatee_id: fc.evaluateeId,
      class_id: fc.classId,
      comments: fc.comments,
      final_points: fc.finalPoints,
      created_at: fc.createdAt,
      updated_at: fc.updatedAt,
      evaluator_name: `${fc.evaluator.firstName} ${fc.evaluator.lastName}`.trim(),
      evaluatee_name: `${fc.evaluatee.firstName} ${fc.evaluatee.lastName}`.trim(),
      group_name: fc.evaluatee.groupMemberships.find(gm => gm.group?.classId === fc.classId)?.group?.name || null
    })));
  } catch (err) {
    console.error('get all final comments error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get evaluation summary for a user (admin only)
router.get('/summary/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    const evaluations = await prisma.evaluation.findMany({
      where: { evaluateeId: userId },
      select: {
        phase: true,
        contribution: true,
        communication: true,
        reliability: true,
        qualityOfWork: true,
        collaboration: true,
        score: true
      }
    });

    // Group by phase and calculate averages
    const phaseData = {};
    for (const e of evaluations) {
      if (!phaseData[e.phase]) {
        phaseData[e.phase] = {
          contribution: [],
          communication: [],
          reliability: [],
          qualityOfWork: [],
          collaboration: [],
          score: []
        };
      }
      if (e.contribution !== null) phaseData[e.phase].contribution.push(e.contribution);
      if (e.communication !== null) phaseData[e.phase].communication.push(e.communication);
      if (e.reliability !== null) phaseData[e.phase].reliability.push(e.reliability);
      if (e.qualityOfWork !== null) phaseData[e.phase].qualityOfWork.push(e.qualityOfWork);
      if (e.collaboration !== null) phaseData[e.phase].collaboration.push(e.collaboration);
      if (e.score !== null) phaseData[e.phase].score.push(e.score);
    }

    const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const summary = Object.entries(phaseData).map(([phase, data]) => ({
      phase: parseInt(phase),
      avg_contribution: avg(data.contribution),
      avg_communication: avg(data.communication),
      avg_reliability: avg(data.reliability),
      avg_quality_of_work: avg(data.qualityOfWork),
      avg_collaboration: avg(data.collaboration),
      avg_score: avg(data.score),
      num_evaluations: data.score.length || Math.max(
        data.contribution.length,
        data.communication.length,
        data.reliability.length,
        data.qualityOfWork.length,
        data.collaboration.length
      )
    })).sort((a, b) => a.phase - b.phase);

    res.json(summary);
  } catch (err) {
    console.error('get evaluation summary error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ==========================================
// IMAGE ATTACHMENT ENDPOINTS
// ==========================================

// Check if image uploads are available
router.get('/attachments/status', authenticateToken, (req, res) => {
  res.json({
    enabled: isS3Configured(),
    maxFiles: MAX_FILES_PER_EVALUATION,
  });
});

// Upload image to an evaluation
router.post('/:evaluationId/attachments', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!isS3Configured()) {
      return res.status(503).json({ error: 'Image uploads not configured' });
    }

    const evaluationId = parseInt(req.params.evaluationId);

    // Verify the evaluation exists and belongs to the user
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { attachments: true },
    });

    if (!evaluation) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }

    // Only the evaluator or admin can upload
    if (evaluation.evaluatorId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Not authorized to upload to this evaluation' });
    }

    // Check attachment limit
    if (evaluation.attachments.length >= MAX_FILES_PER_EVALUATION) {
      return res.status(400).json({
        error: `Maximum ${MAX_FILES_PER_EVALUATION} images allowed per evaluation`,
      });
    }

    // Validate the file
    const validation = validateFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Generate S3 key and upload
    const s3Key = generateS3Key('phase', evaluationId, req.file.originalname);
    const uploadResult = await uploadFile(req.file.buffer, s3Key, req.file.mimetype);

    if (!uploadResult.success) {
      return res.status(500).json({ error: uploadResult.error });
    }

    // Save attachment record
    const attachment = await prisma.evaluationAttachment.create({
      data: {
        evaluationId,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        s3Key,
      },
    });

    // Get presigned URL for immediate display
    const url = await getPresignedUrl(s3Key);

    res.json({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      url,
      uploadedAt: attachment.uploadedAt,
    });
  } catch (err) {
    console.error('Upload attachment error:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Get attachments for an evaluation
router.get('/:evaluationId/attachments', authenticateToken, async (req, res) => {
  try {
    const evaluationId = parseInt(req.params.evaluationId);

    // Verify the evaluation exists
    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { attachments: true },
    });

    if (!evaluation) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }

    // Only the evaluator, evaluatee, teacher, or admin can view
    const isAuthorized =
      evaluation.evaluatorId === req.user.id ||
      evaluation.evaluateeId === req.user.id ||
      req.user.role === 'admin' ||
      req.user.role === 'teacher';

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Not authorized to view attachments' });
    }

    // Generate presigned URLs for all attachments
    const attachmentsWithUrls = await Promise.all(
      evaluation.attachments.map(async (att) => ({
        id: att.id,
        fileName: att.fileName,
        mimeType: att.mimeType,
        fileSize: att.fileSize,
        url: await getPresignedUrl(att.s3Key),
        uploadedAt: att.uploadedAt,
      }))
    );

    res.json(attachmentsWithUrls);
  } catch (err) {
    console.error('Get attachments error:', err);
    res.status(500).json({ error: 'Failed to get attachments' });
  }
});

// Delete an attachment
router.delete('/attachments/:attachmentId', authenticateToken, async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);

    // Find the attachment
    const attachment = await prisma.evaluationAttachment.findUnique({
      where: { id: attachmentId },
      include: { evaluation: true },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Only the evaluator or admin can delete
    if (attachment.evaluation.evaluatorId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Not authorized to delete this attachment' });
    }

    // Delete from S3
    await deleteFile(attachment.s3Key);

    // Delete from database
    await prisma.evaluationAttachment.delete({
      where: { id: attachmentId },
    });

    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    console.error('Delete attachment error:', err);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

module.exports = router;
