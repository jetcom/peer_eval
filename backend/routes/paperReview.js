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
            assignment: { select: { classId: true } }
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

    // Check if past deadline (if set)
    let isLate = 0;
    if (round.submissionDeadline) {
      const deadline = new Date(round.submissionDeadline);
      if (new Date() > deadline) {
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
    const userId = req.user.id;

    // Look up round by evalTypeId to get actual round.id
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId }
    });

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    const paper = await prisma.paper.findUnique({
      where: { roundId_authorId: { roundId: round.id, authorId: userId } }
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
        papers: true
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

    if (round.status !== 'submission') {
      return res.status(400).json({ error: 'Review period already started' });
    }

    // Get list of students who submitted (or all students if not requiring submission)
    let eligibleStudents;
    if (round.requireSubmissionToReview === 1) {
      eligibleStudents = round.papers.map(p => p.authorId);
    } else {
      eligibleStudents = round.evalType.assignment.class.enrollments.map(e => e.userId);
    }

    if (eligibleStudents.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 students to start review' });
    }

    // Get papers to assign (only from students who submitted)
    const papersToAssign = round.papers;
    if (papersToAssign.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 papers to start review' });
    }

    // Create circular assignments (shuffle for randomness)
    const shuffled = [...papersToAssign].sort(() => Math.random() - 0.5);
    const assignments = shuffled.map((paper, i) => ({
      roundId: round.id,  // Use actual round.id, not evalTypeId
      reviewerId: paper.authorId,
      paperId: shuffled[(i + 1) % shuffled.length].id
    }));

    // Calculate review deadline
    const durationHours = duration_hours || round.reviewDurationHours;
    const reviewStartedAt = new Date();
    const reviewDeadline = new Date(reviewStartedAt.getTime() + durationHours * 60 * 60 * 1000);

    // Update round and create assignments in transaction
    await prisma.$transaction([
      prisma.paperReviewRound.update({
        where: { evalTypeId: roundId },
        data: {
          status: 'review',
          reviewStartedAt,
          reviewDeadline: reviewDeadline.toISOString(),
          reviewDurationHours: durationHours
        }
      }),
      prisma.paperReviewAssignment.createMany({
        data: assignments
      })
    ]);

    res.json({
      message: 'Review period started',
      assignments_created: assignments.length,
      review_deadline: reviewDeadline.toISOString()
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
            assignment: { select: { classId: true } }
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
    let isLate = 0;
    if (round.submissionDeadline) {
      const deadline = new Date(round.submissionDeadline);
      if (new Date() > deadline) {
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
      review_duration_hours,
      anonymous_reviews,
      require_submission_to_review,
      auto_release_feedback
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
    if (review_duration_hours !== undefined) updateData.reviewDurationHours = review_duration_hours;
    if (anonymous_reviews !== undefined) updateData.anonymousReviews = anonymous_reviews ? 1 : 0;
    if (require_submission_to_review !== undefined) updateData.requireSubmissionToReview = require_submission_to_review ? 1 : 0;
    if (auto_release_feedback !== undefined) updateData.autoReleaseFeedback = auto_release_feedback ? 1 : 0;

    const updated = await prisma.paperReviewRound.update({
      where: { evalTypeId: roundId },
      data: updateData
    });

    res.json({
      id: updated.id,
      submission_deadline: updated.submissionDeadline,
      review_duration_hours: updated.reviewDurationHours,
      anonymous_reviews: updated.anonymousReviews === 1,
      require_submission_to_review: updated.requireSubmissionToReview === 1,
      auto_release_feedback: updated.autoReleaseFeedback === 1
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
    const userId = req.user.id;

    // Look up round by evalTypeId to get actual round.id
    const round = await prisma.paperReviewRound.findUnique({
      where: { evalTypeId: roundId }
    });

    if (!round) {
      return res.json(null);
    }

    const assignment = await prisma.paperReviewAssignment.findUnique({
      where: { roundId_reviewerId: { roundId: round.id, reviewerId: userId } },
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

module.exports = router;
