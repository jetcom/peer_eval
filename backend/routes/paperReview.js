const express = require('express');
const router = express.Router();
const multer = require('multer');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const {
  isS3Configured,
  validatePdfFile,
  generatePaperS3Key,
  uploadFile,
  getPresignedUrl,
  deleteFile,
  MAX_FILE_SIZE_PDF,
} = require('../utils/s3');
const { isPastDueDate } = require('../utils/dateUtils');
const { startReviewPeriod } = require('../services/paperReviewService');
const { sendBulkNudge, notifyTeacherOfNudges } = require('../services/email');

// Configure multer for memory storage with PDF size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_PDF },
});

// Helper: Check if user is teacher/admin for a class
async function isTeacherOrAdmin(userId, role, classId) {
  if (role === 'admin') return true;
  if (role !== 'teacher') return false;

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { teacherId: true }
  });
  return cls?.teacherId === userId;
}

// Helper: Get class ID from round
async function getClassIdFromRound(roundId) {
  const round = await prisma.paperReviewRound.findUnique({
    where: { evalTypeId: roundId },
    include: {
      evalType: {
        include: {
          assignment: {
            select: { classId: true }
          }
        }
      }
    }
  });
  return round?.evalType?.assignment?.classId || null;
}

// Helper: Check if user is enrolled in the class for this round
async function isEnrolledInRoundClass(userId, roundId) {
  const classId = await getClassIdFromRound(roundId);
  if (!classId) return false;

  const enrollment = await prisma.classEnrollment.findUnique({
    where: { classId_userId: { classId, userId } }
  });
  return !!enrollment;
}

// ===========================================
// PAPER SUBMISSION ENDPOINTS
// ===========================================

// Upload paper (student)
router.post('/:roundId/papers', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const userId = req.user.id;

    // Check S3 is configured
    if (!isS3Configured()) {
      return res.status(503).json({ error: 'File storage not configured' });
    }

    // Validate file
    const validation = validatePdfFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Get round and check it exists and is in submission phase
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId },
      include: {
        evalType: {
          include: {
            assignment: {
              include: { class: { select: { dueDateTimezone: true } } }
            }
          }
        }
      }
    });

    if (!round) {
      return res.status(404).json({ error: 'Paper review round not found' });
    }

    if (round.status !== 'submission') {
      return res.status(400).json({ error: 'Submission period has ended' });
    }

    // Check user is enrolled
    const classId = round.evalType.assignment.classId;
    const enrollment = await prisma.classEnrollment.findUnique({
      where: { classId_userId: { classId, userId } }
    });
    if (!enrollment) {
      return res.status(403).json({ error: 'You are not enrolled in this class' });
    }

    // Check if past deadline (if set) — compare in class timezone
    const classTimezone = round.evalType.assignment.class?.dueDateTimezone;
    let isLate = 0;
    if (round.submissionDeadline) {
      if (isPastDueDate(round.submissionDeadline, classTimezone)) {
        isLate = 1;
      }
    }

    // Use the actual round.id (not evalTypeId) for Paper operations
    const actualRoundId = round.id;

    // Check for existing paper (to replace)
    const existingPaper = await prisma.paper.findUnique({
      where: { roundId_authorId: { roundId: actualRoundId, authorId: userId } }
    });

    // Delete old file from S3 if replacing
    if (existingPaper) {
      await deleteFile(existingPaper.s3Key);
    }

    // Upload to S3
    const s3Key = generatePaperS3Key(actualRoundId, userId, req.file.originalname);
    const uploadResult = await uploadFile(req.file.buffer, s3Key, req.file.mimetype);

    if (!uploadResult.success) {
      return res.status(500).json({ error: 'Failed to upload file' });
    }

    // Create or update paper record
    const paper = await prisma.paper.upsert({
      where: { roundId_authorId: { roundId: actualRoundId, authorId: userId } },
      update: {
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        s3Key,
        submittedAt: new Date(),
        isLate
      },
      create: {
        roundId: actualRoundId,
        authorId: userId,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        s3Key,
        isLate
      }
    });

    res.json({
      id: paper.id,
      file_name: paper.fileName,
      file_size: paper.fileSize,
      submitted_at: paper.submittedAt,
      is_late: paper.isLate === 1
    });
  } catch (error) {
    console.error('Paper upload error:', error);
    res.status(500).json({ error: 'Failed to upload paper' });
  }
});

// Get my submitted paper
router.get('/:roundId/my-paper', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const isTeacher = req.user.role === 'teacher' || req.user.role === 'admin';
    const targetUserId = (isTeacher && req.query.user_id) ? parseInt(req.query.user_id) : req.user.id;

    // Look up round by evalTypeId to get actual round.id
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    const paper = await prisma.paper.findUnique({
      where: { roundId_authorId: { roundId: round.id, authorId: targetUserId } }
    });

    if (!paper) {
      return res.json(null);
    }

    const url = await getPresignedUrl(paper.s3Key);

    res.json({
      id: paper.id,
      file_name: paper.fileName,
      file_size: paper.fileSize,
      submitted_at: paper.submittedAt,
      is_late: paper.isLate === 1,
      url
    });
  } catch (error) {
    console.error('Get my paper error:', error);
    res.status(500).json({ error: 'Failed to get paper' });
  }
});

// Delete my paper (before review starts)
router.delete('/:roundId/my-paper', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const userId = req.user.id;

    // Check round is still in submission phase
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId }
    });

    if (!round || round.status !== 'submission') {
      return res.status(400).json({ error: 'Cannot delete paper after submission period' });
    }

    const paper = await prisma.paper.findUnique({
      where: { roundId_authorId: { roundId: round.id, authorId: userId } }
    });

    if (!paper) {
      return res.status(404).json({ error: 'No paper found' });
    }

    // Delete from S3
    await deleteFile(paper.s3Key);

    // Delete from database
    await prisma.paper.delete({
      where: { id: paper.id }
    });

    res.json({ message: 'Paper deleted' });
  } catch (error) {
    console.error('Delete paper error:', error);
    res.status(500).json({ error: 'Failed to delete paper' });
  }
});

// ===========================================
// TEACHER MANAGEMENT ENDPOINTS
// ===========================================

// Get round status (teacher)
router.get('/:roundId/status', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);

    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId },
      include: {
        evalType: {
          include: {
            assignment: {
              include: {
                class: {
                  include: {
                    enrollments: { select: { userId: true } }
                  }
                }
              }
            }
          }
        },
        papers: {
          include: {
            author: { select: { id: true, firstName: true, lastName: true, email: true } }
          }
        },
        assignments: {
          include: {
            reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
            paper: {
              include: {
                author: { select: { id: true, firstName: true, lastName: true } }
              }
            },
            review: { select: { id: true, submittedAt: true } }
          }
        }
      }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    // Check user is teacher/admin
    const classId = round.evalType.assignment.classId;
    const canAccess = await isTeacherOrAdmin(req.user.id, req.user.role, classId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const enrolledStudents = round.evalType.assignment.class.enrollments;
    const totalStudents = enrolledStudents.length;
    const submittedCount = round.papers.length;
    const reviewsCompleted = round.assignments.filter(a => a.review?.submittedAt).length;

    // Get list of students who haven't submitted
    const submittedAuthorIds = new Set(round.papers.map(p => p.authorId));
    const studentsNotSubmitted = enrolledStudents
      .filter(e => !submittedAuthorIds.has(e.userId))
      .map(e => e.userId);

    // Fetch student details for those who haven't submitted
    const notSubmittedStudents = studentsNotSubmitted.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: studentsNotSubmitted } },
          select: { id: true, firstName: true, lastName: true, email: true }
        })
      : [];

    res.json({
      id: round.id,
      status: round.status,
      submission_deadline: round.submissionDeadline,
      review_started_at: round.reviewStartedAt,
      review_deadline: round.reviewDeadline,
      review_duration_hours: round.reviewDurationHours,
      feedback_released_at: round.feedbackReleasedAt,
      auto_release_feedback: round.autoReleaseFeedback === 1,
      anonymous_reviews: round.anonymousReviews === 1,
      require_submission_to_review: round.requireSubmissionToReview === 1,
      auto_start_review: round.autoStartReview === 1,
      total_students: totalStudents,
      submitted_count: submittedCount,
      assignments_count: round.assignments.length,
      reviews_completed: reviewsCompleted,
      papers: round.papers.map(p => ({
        id: p.id,
        author: {
          id: p.author.id,
          name: `${p.author.firstName} ${p.author.lastName}`.trim(),
          email: p.author.email
        },
        file_name: p.fileName,
        submitted_at: p.submittedAt,
        is_late: p.isLate === 1
      })),
      assignments: round.assignments.map(a => ({
        id: a.id,
        reviewer: {
          id: a.reviewer.id,
          name: `${a.reviewer.firstName} ${a.reviewer.lastName}`.trim(),
          email: a.reviewer.email
        },
        author: {
          id: a.paper.author.id,
          name: `${a.paper.author.firstName} ${a.paper.author.lastName}`.trim()
        },
        review_submitted: !!a.review?.submittedAt
      })),
      students_not_submitted: notSubmittedStudents.map(s => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        email: s.email
      }))
    });
  } catch (error) {
    console.error('Get round status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// Get paper URL for viewing (teacher)
router.get('/:roundId/papers/:paperId/view', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const paperId = parseInt(req.params.paperId);

    // Get round and verify teacher access
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId },
      include: {
        evalType: {
          include: {
            assignment: { select: { classId: true } }
          }
        }
      }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    // Check user is teacher/admin
    const classId = round.evalType.assignment.classId;
    const canAccess = await isTeacherOrAdmin(req.user.id, req.user.role, classId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get the paper
    const paper = await prisma.paper.findUnique({
      where: { id: paperId },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } }
      }
    });

    if (!paper || paper.roundId !== round.id) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const url = await getPresignedUrl(paper.s3Key);

    res.json({
      id: paper.id,
      file_name: paper.fileName,
      file_size: paper.fileSize,
      author: {
        id: paper.author.id,
        name: `${paper.author.firstName} ${paper.author.lastName}`.trim()
      },
      url
    });
  } catch (error) {
    console.error('Get paper view error:', error);
    res.status(500).json({ error: 'Failed to get paper' });
  }
});

// Get teacher review for a paper (or create if doesn't exist)
router.get('/:roundId/papers/:paperId/teacher-review', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const paperId = parseInt(req.params.paperId);

    // Get round and verify teacher access
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId },
      include: {
        evalType: {
          include: {
            assignment: { select: { classId: true } }
          }
        }
      }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    const classId = round.evalType.assignment.classId;
    const canAccess = await isTeacherOrAdmin(req.user.id, req.user.role, classId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get the paper
    const paper = await prisma.paper.findUnique({
      where: { id: paperId },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } }
      }
    });

    if (!paper || paper.roundId !== round.id) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    // Get or create teacher review
    let review = await prisma.paperReview.findUnique({
      where: { paperId_teacherId: { paperId, teacherId: req.user.id } },
      include: { annotations: true }
    });

    if (!review) {
      review = await prisma.paperReview.create({
        data: {
          paperId,
          teacherId: req.user.id
        },
        include: { annotations: true }
      });
    }

    const url = await getPresignedUrl(paper.s3Key);

    res.json({
      paper: {
        id: paper.id,
        file_name: paper.fileName,
        file_size: paper.fileSize,
        url,
        author: {
          id: paper.author.id,
          name: `${paper.author.firstName} ${paper.author.lastName}`.trim()
        }
      },
      review: {
        id: review.id,
        overall_comments: review.overallComments,
        submitted_at: review.submittedAt,
        annotations: review.annotations.map(a => ({
          id: a.id,
          type: a.annotationType,
          position: JSON.parse(a.positionData),
          content: a.content,
          color: a.color
        }))
      }
    });
  } catch (error) {
    console.error('Get teacher review error:', error);
    res.status(500).json({ error: 'Failed to get teacher review' });
  }
});

// Save teacher review
router.post('/:roundId/papers/:paperId/teacher-review', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const paperId = parseInt(req.params.paperId);
    const { overall_comments } = req.body;

    // Verify teacher access
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId },
      include: {
        evalType: {
          include: {
            assignment: { select: { classId: true } }
          }
        }
      }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    const classId = round.evalType.assignment.classId;
    const canAccess = await isTeacherOrAdmin(req.user.id, req.user.role, classId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update or create review
    const review = await prisma.paperReview.upsert({
      where: { paperId_teacherId: { paperId, teacherId: req.user.id } },
      update: {
        overallComments: overall_comments,
        updatedAt: new Date()
      },
      create: {
        paperId,
        teacherId: req.user.id,
        overallComments: overall_comments
      }
    });

    res.json({
      id: review.id,
      overall_comments: review.overallComments
    });
  } catch (error) {
    console.error('Save teacher review error:', error);
    res.status(500).json({ error: 'Failed to save teacher review' });
  }
});

// Add annotation to teacher review
router.post('/:roundId/papers/:paperId/teacher-review/annotations', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const paperId = parseInt(req.params.paperId);
    const { type, position, content, color } = req.body;

    // Verify teacher access
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId },
      include: {
        evalType: {
          include: {
            assignment: { select: { classId: true } }
          }
        }
      }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    const classId = round.evalType.assignment.classId;
    const canAccess = await isTeacherOrAdmin(req.user.id, req.user.role, classId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get or create teacher review
    let review = await prisma.paperReview.findUnique({
      where: { paperId_teacherId: { paperId, teacherId: req.user.id } }
    });

    if (!review) {
      review = await prisma.paperReview.create({
        data: {
          paperId,
          teacherId: req.user.id
        }
      });
    }

    const annotation = await prisma.paperAnnotation.create({
      data: {
        reviewId: review.id,
        annotationType: type,
        positionData: JSON.stringify(position),
        content,
        color: color || '#ffff00'
      }
    });

    res.json({
      id: annotation.id,
      type: annotation.annotationType,
      position: JSON.parse(annotation.positionData),
      content: annotation.content,
      color: annotation.color
    });
  } catch (error) {
    console.error('Add teacher annotation error:', error);
    res.status(500).json({ error: 'Failed to add annotation' });
  }
});

// Update teacher annotation
router.put('/:roundId/papers/:paperId/teacher-review/annotations/:annotationId', authenticateToken, async (req, res) => {
  try {
    const annotationId = parseInt(req.params.annotationId);
    const { content, color, position } = req.body;

    // Verify ownership through the chain
    const annotation = await prisma.paperAnnotation.findUnique({
      where: { id: annotationId },
      include: {
        review: true
      }
    });

    if (!annotation || annotation.review.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateData = {};
    if (content !== undefined) updateData.content = content;
    if (color !== undefined) updateData.color = color;
    if (position !== undefined) updateData.positionData = JSON.stringify(position);

    const updated = await prisma.paperAnnotation.update({
      where: { id: annotationId },
      data: updateData
    });

    res.json({
      id: updated.id,
      type: updated.annotationType,
      position: JSON.parse(updated.positionData),
      content: updated.content,
      color: updated.color
    });
  } catch (error) {
    console.error('Update teacher annotation error:', error);
    res.status(500).json({ error: 'Failed to update annotation' });
  }
});

// Delete teacher annotation
router.delete('/:roundId/papers/:paperId/teacher-review/annotations/:annotationId', authenticateToken, async (req, res) => {
  try {
    const annotationId = parseInt(req.params.annotationId);

    // Verify ownership
    const annotation = await prisma.paperAnnotation.findUnique({
      where: { id: annotationId },
      include: {
        review: true
      }
    });

    if (!annotation || annotation.review.teacherId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.paperAnnotation.delete({
      where: { id: annotationId }
    });

    res.json({ message: 'Annotation deleted' });
  } catch (error) {
    console.error('Delete teacher annotation error:', error);
    res.status(500).json({ error: 'Failed to delete annotation' });
  }
});

// Start review period (teacher)
router.post('/:roundId/start-review', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const { duration_hours } = req.body;

    // Auth check: verify teacher/admin before delegating to service
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId },
      include: {
        evalType: {
          include: {
            assignment: { select: { classId: true } }
          }
        }
      }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    const classId = round.evalType.assignment.classId;
    const canAccess = await isTeacherOrAdmin(req.user.id, req.user.role, classId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await startReviewPeriod(roundId, { durationHours: duration_hours });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      message: 'Review period started',
      assignments_created: result.assignmentsCreated,
      review_deadline: result.reviewDeadline
    });
  } catch (error) {
    console.error('Start review error:', error);
    res.status(500).json({ error: 'Failed to start review period' });
  }
});

// Release feedback early (teacher)
router.post('/:roundId/release-feedback', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);

    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId },
      include: {
        evalType: {
          include: {
            assignment: { select: { classId: true } }
          }
        }
      }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    // Check user is teacher/admin
    const classId = round.evalType.assignment.classId;
    const canAccess = await isTeacherOrAdmin(req.user.id, req.user.role, classId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (round.status === 'submission') {
      return res.status(400).json({ error: 'Review period has not started' });
    }

    await prisma.paperReviewRound.update({
      where: { evalTypeId: roundId },
      data: {
        status: 'completed',
        feedbackReleasedAt: new Date()
      }
    });

    res.json({ message: 'Feedback released' });
  } catch (error) {
    console.error('Release feedback error:', error);
    res.status(500).json({ error: 'Failed to release feedback' });
  }
});

// Schedule review start with nudge emails to non-submitters (teacher)
router.post('/:roundId/schedule-start', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const { start_in_hours } = req.body;

    if (!start_in_hours || start_in_hours < 0.5) {
      return res.status(400).json({ error: 'start_in_hours must be at least 0.5' });
    }

    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId },
      include: {
        evalType: {
          include: {
            assignment: {
              include: {
                class: {
                  include: {
                    enrollments: { select: { userId: true } },
                    teacher: { select: { id: true, firstName: true, lastName: true, email: true } }
                  }
                }
              }
            }
          }
        },
        papers: { select: { authorId: true } }
      }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    if (round.status !== 'submission') {
      return res.status(400).json({ error: 'Round is not in submission phase' });
    }

    const classId = round.evalType.assignment.classId;
    const canAccess = await isTeacherOrAdmin(req.user.id, req.user.role, classId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate new submission deadline
    const submissionDeadline = new Date(Date.now() + start_in_hours * 60 * 60 * 1000);

    // Update round: set deadline and enable auto-start
    await prisma.paperReviewRound.update({
      where: { evalTypeId: roundId },
      data: {
        submissionDeadline: submissionDeadline.toISOString(),
        autoStartReview: 1
      }
    });

    // Find students who haven't submitted
    const submittedAuthorIds = new Set(round.papers.map(p => p.authorId));
    const notSubmittedUserIds = round.evalType.assignment.class.enrollments
      .filter(e => !submittedAuthorIds.has(e.userId))
      .map(e => e.userId);

    let studentsNudged = 0;
    if (notSubmittedUserIds.length > 0) {
      const students = await prisma.user.findMany({
        where: { id: { in: notSubmittedUserIds } },
        select: { id: true, firstName: true, lastName: true, email: true }
      });

      const className = round.evalType.assignment.class.name;
      const assignmentName = round.evalType.assignment.name;
      const teacher = round.evalType.assignment.class.teacher;
      const instructorName = `${teacher.firstName} ${teacher.lastName}`.trim();

      const deadlineStr = submissionDeadline.toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      });

      await sendBulkNudge({
        students: students.map(s => ({
          email: s.email,
          firstName: s.firstName,
          lastName: s.lastName
        })),
        className,
        assignmentName,
        instructorName,
        subject: 'Paper Review Starting Soon — Submit Now',
        message: `Your instructor is starting the peer review for "${assignmentName}" in ${start_in_hours} hour${start_in_hours !== 1 ? 's' : ''}. Submit your paper before ${deadlineStr} to participate.`
      });

      studentsNudged = students.length;

      // Notify teacher about the nudge batch
      await notifyTeacherOfNudges({
        teacherEmail: teacher.email,
        teacherName: instructorName,
        className,
        students
      });
    }

    res.json({
      scheduled_start: submissionDeadline.toISOString(),
      students_nudged: studentsNudged,
      submission_deadline: submissionDeadline.toISOString()
    });
  } catch (error) {
    console.error('Schedule start error:', error);
    res.status(500).json({ error: 'Failed to schedule review start' });
  }
});

// Upload paper on behalf of a student (teacher)
router.post('/:roundId/papers/:studentId', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const studentId = parseInt(req.params.studentId);

    // Check S3 is configured
    if (!isS3Configured()) {
      return res.status(503).json({ error: 'File storage not configured' });
    }

    // Validate file
    const validation = validatePdfFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Get round and verify teacher access
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId },
      include: {
        evalType: {
          include: {
            assignment: {
              include: { class: { select: { dueDateTimezone: true } } }
            }
          }
        }
      }
    });

    if (!round) {
      return res.status(404).json({ error: 'Paper review round not found' });
    }

    // Check user is teacher/admin
    const classId = round.evalType.assignment.classId;
    const canAccess = await isTeacherOrAdmin(req.user.id, req.user.role, classId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (round.status !== 'submission') {
      return res.status(400).json({ error: 'Submission period has ended' });
    }

    // Check student is enrolled in this class
    const enrollment = await prisma.classEnrollment.findUnique({
      where: { classId_userId: { classId, userId: studentId } }
    });
    if (!enrollment) {
      return res.status(400).json({ error: 'Student is not enrolled in this class' });
    }

    // Check if past deadline (mark as late but still allow teacher upload)
    const classTimezone = round.evalType.assignment.class?.dueDateTimezone;
    let isLate = 0;
    if (round.submissionDeadline) {
      if (isPastDueDate(round.submissionDeadline, classTimezone)) {
        isLate = 1;
      }
    }

    // Use the actual round.id (not evalTypeId) for Paper operations
    const actualRoundId = round.id;

    // Check for existing paper (to replace)
    const existingPaper = await prisma.paper.findUnique({
      where: { roundId_authorId: { roundId: actualRoundId, authorId: studentId } }
    });

    // Delete old file from S3 if replacing
    if (existingPaper) {
      await deleteFile(existingPaper.s3Key);
    }

    // Upload to S3
    const s3Key = generatePaperS3Key(actualRoundId, studentId, req.file.originalname);
    const uploadResult = await uploadFile(req.file.buffer, s3Key, req.file.mimetype);

    if (!uploadResult.success) {
      return res.status(500).json({ error: 'Failed to upload file' });
    }

    // Create or update paper record
    const paper = await prisma.paper.upsert({
      where: { roundId_authorId: { roundId: actualRoundId, authorId: studentId } },
      update: {
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        s3Key,
        submittedAt: new Date(),
        isLate
      },
      create: {
        roundId: actualRoundId,
        authorId: studentId,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        s3Key,
        isLate
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });

    res.json({
      id: paper.id,
      file_name: paper.fileName,
      file_size: paper.fileSize,
      submitted_at: paper.submittedAt,
      is_late: paper.isLate === 1,
      author: {
        id: paper.author.id,
        name: `${paper.author.firstName} ${paper.author.lastName}`.trim(),
        email: paper.author.email
      }
    });
  } catch (error) {
    console.error('Teacher paper upload error:', error);
    res.status(500).json({ error: 'Failed to upload paper' });
  }
});

// Update round settings (teacher)
router.put('/:roundId/settings', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const {
      submission_deadline,
      review_deadline,
      review_duration_hours,
      anonymous_reviews,
      require_submission_to_review,
      auto_release_feedback,
      auto_start_review
    } = req.body;

    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId },
      include: {
        evalType: {
          include: {
            assignment: { select: { classId: true } }
          }
        }
      }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    // Check user is teacher/admin
    const classId = round.evalType.assignment.classId;
    const canAccess = await isTeacherOrAdmin(req.user.id, req.user.role, classId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateData = {};
    if (submission_deadline !== undefined) updateData.submissionDeadline = submission_deadline;
    if (review_deadline !== undefined) updateData.reviewDeadline = review_deadline;
    if (review_duration_hours !== undefined) updateData.reviewDurationHours = review_duration_hours;
    if (anonymous_reviews !== undefined) updateData.anonymousReviews = anonymous_reviews ? 1 : 0;
    if (require_submission_to_review !== undefined) updateData.requireSubmissionToReview = require_submission_to_review ? 1 : 0;
    if (auto_release_feedback !== undefined) updateData.autoReleaseFeedback = auto_release_feedback ? 1 : 0;
    if (auto_start_review !== undefined) updateData.autoStartReview = auto_start_review ? 1 : 0;

    const updated = await prisma.paperReviewRound.update({
      where: { evalTypeId: roundId },
      data: updateData
    });

    res.json({
      id: updated.id,
      submission_deadline: updated.submissionDeadline,
      review_deadline: updated.reviewDeadline,
      review_duration_hours: updated.reviewDurationHours,
      anonymous_reviews: updated.anonymousReviews === 1,
      require_submission_to_review: updated.requireSubmissionToReview === 1,
      auto_release_feedback: updated.autoReleaseFeedback === 1,
      auto_start_review: updated.autoStartReview === 1
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ===========================================
// REVIEW ENDPOINTS
// ===========================================

// Get my assigned paper to review
router.get('/:roundId/my-assignment', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const isTeacher = req.user.role === 'teacher' || req.user.role === 'admin';
    const targetUserId = (isTeacher && req.query.user_id) ? parseInt(req.query.user_id) : req.user.id;

    // Look up round by evalTypeId to get actual round.id
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId }
    });

    if (!round) {
      return res.json(null);
    }

    const assignment = await prisma.paperReviewAssignment.findUnique({
      where: { roundId_reviewerId: { roundId: round.id, reviewerId: targetUserId } },
      include: {
        paper: {
          include: {
            author: { select: { id: true, firstName: true, lastName: true } }
          }
        },
        round: true,
        review: {
          include: {
            annotations: true
          }
        }
      }
    });

    if (!assignment) {
      return res.json(null);
    }

    // Get presigned URL for the paper
    const paperUrl = await getPresignedUrl(assignment.paper.s3Key);

    res.json({
      id: assignment.id,
      paper: {
        id: assignment.paper.id,
        file_name: assignment.paper.fileName,
        file_size: assignment.paper.fileSize,
        url: paperUrl,
        author: {
          id: assignment.paper.author.id,
          name: `${assignment.paper.author.firstName} ${assignment.paper.author.lastName}`.trim()
        }
      },
      review_deadline: assignment.round.reviewDeadline,
      review: assignment.review ? {
        id: assignment.review.id,
        overall_comments: assignment.review.overallComments,
        submitted_at: assignment.review.submittedAt,
        annotations: assignment.review.annotations.map(a => ({
          id: a.id,
          type: a.annotationType,
          position: JSON.parse(a.positionData),
          content: a.content,
          color: a.color
        }))
      } : null
    });
  } catch (error) {
    console.error('Get assignment error:', error);
    res.status(500).json({ error: 'Failed to get assignment' });
  }
});

// Save/update review
router.post('/:roundId/my-review', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const userId = req.user.id;
    const { overall_comments, submit } = req.body;

    // Look up round by evalTypeId to get actual round.id
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    // Get assignment
    const assignment = await prisma.paperReviewAssignment.findUnique({
      where: { roundId_reviewerId: { roundId: round.id, reviewerId: userId } },
      include: { round: true, review: true }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'No assignment found' });
    }

    // Check if review period is still active
    if (assignment.round.status !== 'review') {
      return res.status(400).json({ error: 'Review period is not active' });
    }

    // Check deadline
    if (assignment.round.reviewDeadline) {
      const deadline = new Date(assignment.round.reviewDeadline);
      if (new Date() > deadline) {
        return res.status(400).json({ error: 'Review deadline has passed' });
      }
    }

    const reviewData = {
      overallComments: overall_comments,
      updatedAt: new Date()
    };

    if (submit) {
      reviewData.submittedAt = new Date();
    }

    let review;
    if (assignment.review) {
      review = await prisma.paperReview.update({
        where: { id: assignment.review.id },
        data: reviewData
      });
    } else {
      review = await prisma.paperReview.create({
        data: {
          assignmentId: assignment.id,
          ...reviewData
        }
      });
    }

    res.json({
      id: review.id,
      overall_comments: review.overallComments,
      submitted_at: review.submittedAt
    });
  } catch (error) {
    console.error('Save review error:', error);
    res.status(500).json({ error: 'Failed to save review' });
  }
});

// Add annotation
router.post('/:roundId/my-review/annotations', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const userId = req.user.id;
    const { type, position, content, color } = req.body;

    // Look up round by evalTypeId to get actual round.id
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    // Get assignment and ensure review exists
    const assignment = await prisma.paperReviewAssignment.findUnique({
      where: { roundId_reviewerId: { roundId: round.id, reviewerId: userId } },
      include: { round: true, review: true }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'No assignment found' });
    }

    if (assignment.round.status !== 'review') {
      return res.status(400).json({ error: 'Review period is not active' });
    }

    // Create review if it doesn't exist
    let reviewId = assignment.review?.id;
    if (!reviewId) {
      const review = await prisma.paperReview.create({
        data: { assignmentId: assignment.id }
      });
      reviewId = review.id;
    }

    const annotation = await prisma.paperAnnotation.create({
      data: {
        reviewId,
        annotationType: type,
        positionData: JSON.stringify(position),
        content,
        color: color || '#ffff00'
      }
    });

    res.json({
      id: annotation.id,
      type: annotation.annotationType,
      position: JSON.parse(annotation.positionData),
      content: annotation.content,
      color: annotation.color
    });
  } catch (error) {
    console.error('Add annotation error:', error);
    res.status(500).json({ error: 'Failed to add annotation' });
  }
});

// Update annotation
router.put('/:roundId/annotations/:annotationId', authenticateToken, async (req, res) => {
  try {
    const annotationId = parseInt(req.params.annotationId);
    const { content, color, position } = req.body;

    // Verify ownership through the chain
    const annotation = await prisma.paperAnnotation.findUnique({
      where: { id: annotationId },
      include: {
        review: {
          include: {
            assignment: true
          }
        }
      }
    });

    if (!annotation || annotation.review.assignment.reviewerId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateData = {};
    if (content !== undefined) updateData.content = content;
    if (color !== undefined) updateData.color = color;
    if (position !== undefined) updateData.positionData = JSON.stringify(position);

    const updated = await prisma.paperAnnotation.update({
      where: { id: annotationId },
      data: updateData
    });

    res.json({
      id: updated.id,
      type: updated.annotationType,
      position: JSON.parse(updated.positionData),
      content: updated.content,
      color: updated.color
    });
  } catch (error) {
    console.error('Update annotation error:', error);
    res.status(500).json({ error: 'Failed to update annotation' });
  }
});

// Delete annotation
router.delete('/:roundId/annotations/:annotationId', authenticateToken, async (req, res) => {
  try {
    const annotationId = parseInt(req.params.annotationId);

    // Verify ownership
    const annotation = await prisma.paperAnnotation.findUnique({
      where: { id: annotationId },
      include: {
        review: {
          include: {
            assignment: true
          }
        }
      }
    });

    if (!annotation || annotation.review.assignment.reviewerId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.paperAnnotation.delete({
      where: { id: annotationId }
    });

    res.json({ message: 'Annotation deleted' });
  } catch (error) {
    console.error('Delete annotation error:', error);
    res.status(500).json({ error: 'Failed to delete annotation' });
  }
});

// ===========================================
// FEEDBACK VIEWING ENDPOINTS
// ===========================================

// Get feedback on my paper
router.get('/:roundId/my-feedback', authenticateToken, async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const userId = req.user.id;

    // Get the round
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    // Check if feedback is released
    const feedbackAvailable = round.feedbackReleasedAt ||
      (round.autoReleaseFeedback === 1 && round.status === 'completed') ||
      (round.autoReleaseFeedback === 1 && round.reviewDeadline && new Date() > new Date(round.reviewDeadline));

    if (!feedbackAvailable) {
      return res.json({ available: false, message: 'Feedback not yet available' });
    }

    // Get the paper and its review
    const paper = await prisma.paper.findUnique({
      where: { roundId_authorId: { roundId: round.id, authorId: userId } },
      include: {
        assignedReview: {
          include: {
            reviewer: { select: { id: true, firstName: true, lastName: true } },
            review: {
              include: {
                annotations: true
              }
            }
          }
        }
      }
    });

    if (!paper) {
      return res.json({ available: true, paper: null, message: 'You did not submit a paper' });
    }

    if (!paper.assignedReview?.review) {
      return res.json({ available: true, paper: { id: paper.id }, review: null, message: 'No review received yet' });
    }

    const review = paper.assignedReview.review;
    const reviewer = round.anonymousReviews === 1 ? null : {
      id: paper.assignedReview.reviewer.id,
      name: `${paper.assignedReview.reviewer.firstName} ${paper.assignedReview.reviewer.lastName}`.trim()
    };

    // Get paper URL for viewing with annotations
    const paperUrl = await getPresignedUrl(paper.s3Key);

    res.json({
      available: true,
      paper: {
        id: paper.id,
        file_name: paper.fileName,
        url: paperUrl
      },
      reviewer,
      review: {
        id: review.id,
        overall_comments: review.overallComments,
        submitted_at: review.submittedAt,
        annotations: review.annotations.map(a => ({
          id: a.id,
          type: a.annotationType,
          position: JSON.parse(a.positionData),
          content: a.content,
          color: a.color
        }))
      }
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Failed to get feedback' });
  }
});

// GET /class/:classId/report - Paper review report for a class (teacher/admin only)
router.get('/class/:classId/report', authenticateToken, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);
    if (!await isTeacherOrAdmin(req.user.id, req.user.role, classId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get all students enrolled in the class
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } }
    });
    const students = enrollments
      .filter(e => e.user && e.user.role === 'student')
      .map(e => ({ id: e.user.id, name: `${e.user.firstName} ${e.user.lastName}` }));

    // Find paper review rounds via Assignment -> EvalType -> PaperReviewRound
    const assignments = await prisma.assignment.findMany({
      where: { classId },
      include: {
        evalTypes: {
          where: { evalType: 'paper_review' },
          include: {
            paperReviewRound: {
              include: {
                papers: {
                  include: {
                    author: { select: { id: true, firstName: true, lastName: true } },
                    assignedReview: {
                      include: {
                        reviewer: { select: { id: true, firstName: true, lastName: true } },
                        review: {
                          include: {
                            annotations: { select: { id: true } }
                          }
                        }
                      }
                    },
                    teacherReviews: {
                      include: {
                        teacher: { select: { id: true, firstName: true, lastName: true } },
                        annotations: { select: { id: true } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { orderIndex: 'asc' }
    });

    // Flatten: each assignment may have one paper_review eval type with one round
    const result = [];
    for (const assignment of assignments) {
      for (const evalType of assignment.evalTypes) {
        const round = evalType.paperReviewRound;
        if (!round) continue;

        const paperAuthorIds = new Set(round.papers.map(p => p.authorId));
        const studentsWithoutPapers = students.filter(s => !paperAuthorIds.has(s.id));

        const papers = round.papers.map(paper => {
          const peerAssignment = paper.assignedReview;
          const peerReview = peerAssignment?.review;
          const teacherReview = paper.teacherReviews[0] || null;

          const entry = {
            id: paper.id,
            author_id: paper.authorId,
            author_name: `${paper.author.firstName} ${paper.author.lastName}`,
            submitted_at: paper.submittedAt,
            is_late: !!paper.isLate,
            review: null,
            teacher_review: null
          };

          if (peerAssignment) {
            entry.review = {
              reviewer_id: peerAssignment.reviewerId,
              reviewer_name: `${peerAssignment.reviewer.firstName} ${peerAssignment.reviewer.lastName}`,
              submitted_at: peerReview?.submittedAt || null,
              overall_comments: peerReview?.overallComments || null,
              annotation_count: peerReview?.annotations?.length || 0
            };
          }

          if (teacherReview) {
            entry.teacher_review = {
              overall_comments: teacherReview.overallComments || null,
              annotation_count: teacherReview.annotations?.length || 0
            };
          }

          return entry;
        });

        result.push({
          round_id: round.id,
          assignment_name: assignment.name,
          eval_type_name: evalType.name || 'Paper Review',
          status: round.status,
          submission_deadline: round.submissionDeadline,
          review_deadline: round.reviewDeadline,
          feedback_released_at: round.feedbackReleasedAt,
          papers,
          students_without_papers: studentsWithoutPapers
        });
      }
    }

    res.json({ rounds: result });
  } catch (error) {
    console.error('Paper review class report error:', error);
    res.status(500).json({ error: 'Failed to get paper review report' });
  }
});

module.exports = router;
