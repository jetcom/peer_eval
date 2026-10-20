const express = require('express');
const router = express.Router();
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticateToken } = require('../middleware/auth');
const {
  isS3Configured,
  validateFile,
  generateS3Key,
  uploadFile,
  getPresignedUrl,
  deleteFile,
  MAX_FILES_PER_EVALUATION,
} = require('../utils/s3');
const { isPastDueDate } = require('../utils/dateUtils');
const audience = require('../services/audienceService');

const isTeacherOrAdmin = (req) => req.user.role === 'admin' || req.user.role === 'teacher';

// Prisma include for an assignment's eval types with everything the UI shows
const EVAL_TYPES_INCLUDE = {
  evalTypes: {
    include: {
      criteria: { orderBy: { orderIndex: 'asc' } },
      presentationSlots: true
    }
  }
};

// Shape of the schedule endpoints' response
const formatSchedule = (ctx) => ({
  eval_type_id: ctx.evalType.id,
  target_type: ctx.evalType.targetType,
  eval_window_hours: ctx.evalType.evalWindowHours,
  min_completion: ctx.evalType.minCompletion,
  assignment_mode: ctx.evalType.audienceAssignmentMode || 'any',
  round_due_date: ctx.evalType.dueDate || ctx.assignment.dueDate || null,
  timezone: ctx.timezone,
  presenters: audience.listPresenters(ctx),
  students: audience.listStudents(ctx)
});

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Helper to format assignment for response
const formatAssignment = (a) => ({
  id: a.id,
  class_id: a.classId,
  name: a.name,
  description: a.description,
  order_index: a.orderIndex,
  due_date: a.dueDate,
  created_at: a.createdAt,
  eval_types: a.evalTypes?.map(et => ({
    id: et.id,
    assignment_id: et.assignmentId,
    eval_type: et.evalType,
    name: et.name,
    target_type: et.targetType,
    weight: et.weight,
    include_self: et.includeSelf === 1,
    is_required: et.isRequired === 1,
    min_completion: et.minCompletion,
    require_comments: et.requireComments === 1,
    min_comment_words: et.minCommentWords,
    allow_late: et.allowLate === 1,
    due_date: et.dueDate,
    eval_window_hours: et.evalWindowHours,
    assignment_mode: et.audienceAssignmentMode || 'any',
    presentation_slots: et.presentationSlots?.map(ps => ({
      group_id: ps.groupId,
      user_id: ps.userId,
      presentation_date: ps.presentationDate
    })) || [],
    criteria: et.criteria?.map(c => ({
      id: c.id,
      eval_type_id: c.evalTypeId,
      name: c.name,
      description: c.description,
      order_index: c.orderIndex,
      min_value: c.minValue,
      max_value: c.maxValue,
      question_type: c.questionType || 'likert'
    })) || []
  })) || []
});

// Get all assignments for a class
router.get('/class/:classId', authenticateToken, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);

    const assignments = await prisma.assignment.findMany({
      where: { classId },
      include: EVAL_TYPES_INCLUDE,
      orderBy: { orderIndex: 'asc' }
    });

    res.json(assignments.map(formatAssignment));
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// Get a single assignment with full details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: { ...EVAL_TYPES_INCLUDE, class: true }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json(formatAssignment(assignment));
  } catch (error) {
    console.error('Error fetching assignment:', error);
    res.status(500).json({ error: 'Failed to fetch assignment' });
  }
});

// Create a new assignment
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { class_id, name, description, order_index, due_date, eval_types } = req.body;

    // Verify user has permission (teacher or admin)
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const assignment = await prisma.assignment.create({
      data: {
        classId: class_id,
        name,
        description: description || null,
        orderIndex: order_index || 0,
        dueDate: due_date || null,
        evalTypes: eval_types ? {
          create: eval_types.map(et => ({
            evalType: et.eval_type,
            name: et.name,
            targetType: et.target_type || 'individual',
            weight: et.weight || 1.0,
            includeSelf: et.include_self ? 1 : 0,
            isRequired: et.is_required !== false ? 1 : 0,
            minCompletion: et.min_completion || null,
            requireComments: et.require_comments ? 1 : 0,
            minCommentWords: et.min_comment_words || null,
            allowLate: et.allow_late !== false ? 1 : 0,
            dueDate: et.due_date || null,
            evalWindowHours: et.eval_window_hours != null && et.eval_window_hours !== '' ? parseInt(et.eval_window_hours) : null,
            criteria: et.criteria ? {
              create: et.criteria.map((c, idx) => ({
                name: c.name,
                description: c.description || null,
                orderIndex: c.order_index || idx,
                minValue: c.min_value || 1,
                maxValue: c.max_value || 5,
                questionType: c.question_type || 'likert'
              }))
            } : undefined
          }))
        } : undefined
      },
      include: EVAL_TYPES_INCLUDE
    });

    // Create PaperReviewRound for any paper_review eval types
    for (const evalType of assignment.evalTypes) {
      if (evalType.evalType === 'paper_review') {
        await prisma.paperReviewRound.create({
          data: {
            evalTypeId: evalType.id,
            submissionDeadline: due_date || null
          }
        });
      }
    }

    res.status(201).json(formatAssignment(assignment));
  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

// Update an assignment
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, order_index, due_date } = req.body;

    // Verify user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const assignment = await prisma.assignment.update({
      where: { id },
      data: {
        name,
        description: description || null,
        orderIndex: order_index,
        dueDate: due_date || null
      },
      include: EVAL_TYPES_INCLUDE
    });

    res.json(formatAssignment(assignment));
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

// Delete an assignment
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Verify user has permission
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await prisma.assignment.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

// Apply a template to an existing eval type (replaces criteria)
router.put('/eval-type/:evalTypeId/apply-template', authenticateToken, async (req, res) => {
  try {
    const evalTypeId = parseInt(req.params.evalTypeId);
    const { template_id } = req.body;

    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Get the template with criteria
    const template = await prisma.evalTemplate.findUnique({
      where: { id: template_id },
      include: {
        criteria: { orderBy: { orderIndex: 'asc' } }
      }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Delete existing criteria for this eval type
    await prisma.evalTypeCriterion.deleteMany({
      where: { evalTypeId }
    });

    // Create new criteria from template
    for (const c of template.criteria) {
      await prisma.evalTypeCriterion.create({
        data: {
          evalTypeId,
          name: c.name,
          description: c.description || null,
          orderIndex: c.orderIndex,
          minValue: c.minValue,
          maxValue: c.maxValue,
          questionType: c.questionType || 'likert'
        }
      });
    }

    // Re-fetch the eval type with new criteria
    const updatedEvalType = await prisma.assignmentEvalType.findUnique({
      where: { id: evalTypeId },
      include: {
        criteria: { orderBy: { orderIndex: 'asc' } },
        assignment: { include: EVAL_TYPES_INCLUDE }
      }
    });

    res.json(formatAssignment(updatedEvalType.assignment));
  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({ error: 'Failed to apply template' });
  }
});

// Update an eval type's settings (due date, late policy, audience options)
router.put('/eval-type/:evalTypeId', authenticateToken, async (req, res) => {
  try {
    if (!isTeacherOrAdmin(req)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const evalTypeId = parseInt(req.params.evalTypeId);
    const b = req.body;
    const data = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.due_date !== undefined) data.dueDate = b.due_date || null;
    if (b.allow_late !== undefined) data.allowLate = b.allow_late ? 1 : 0;
    if (b.require_comments !== undefined) data.requireComments = b.require_comments ? 1 : 0;
    if (b.min_comment_words !== undefined) data.minCommentWords = b.min_comment_words ? parseInt(b.min_comment_words) : null;
    if (b.target_type !== undefined) {
      if (!['group', 'individual'].includes(b.target_type)) {
        return res.status(400).json({ error: 'target_type must be group or individual' });
      }
      data.targetType = b.target_type;
    }
    if (b.eval_window_hours !== undefined) {
      const hours = b.eval_window_hours === null || b.eval_window_hours === '' ? null : parseInt(b.eval_window_hours);
      if (hours !== null && (Number.isNaN(hours) || hours < 0)) {
        return res.status(400).json({ error: 'eval_window_hours must be a non-negative number' });
      }
      data.evalWindowHours = hours;
    }
    if (b.assignment_mode !== undefined) {
      if (!['any', 'assigned'].includes(b.assignment_mode)) {
        return res.status(400).json({ error: 'assignment_mode must be any or assigned' });
      }
      data.audienceAssignmentMode = b.assignment_mode;
    }
    if (b.min_completion !== undefined) {
      const pct = b.min_completion === null || b.min_completion === '' ? null : parseInt(b.min_completion);
      if (pct !== null && (Number.isNaN(pct) || pct < 1 || pct > 100)) {
        return res.status(400).json({ error: 'min_completion must be a percentage from 1 to 100' });
      }
      data.minCompletion = pct;
    }

    const existing = await prisma.assignmentEvalType.findUnique({ where: { id: evalTypeId } });
    if (!existing) {
      return res.status(404).json({ error: 'Eval type not found' });
    }

    // Switching between group and individual presenters invalidates the schedule,
    // excusals and random assignments
    if (data.targetType && data.targetType !== existing.targetType) {
      await prisma.presentationSlot.deleteMany({ where: { evalTypeId } });
      await prisma.presentationExcusal.deleteMany({ where: { evalTypeId } });
      await prisma.presentationAssignment.deleteMany({ where: { evalTypeId } });
    }

    const updated = await prisma.assignmentEvalType.update({
      where: { id: evalTypeId },
      data,
      include: { assignment: { include: EVAL_TYPES_INCLUDE } }
    });

    res.json(formatAssignment(updated.assignment));
  } catch (error) {
    console.error('Error updating eval type:', error);
    res.status(500).json({ error: 'Failed to update evaluation type' });
  }
});

// Presentation schedule for an audience eval type (teacher view)
router.get('/eval-type/:evalTypeId/schedule', authenticateToken, async (req, res) => {
  try {
    if (!isTeacherOrAdmin(req)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const ctx = await audience.loadAudienceContext(parseInt(req.params.evalTypeId));
    if (!ctx) {
      return res.status(404).json({ error: 'Eval type not found' });
    }
    res.json(formatSchedule(ctx));
  } catch (error) {
    console.error('Error fetching presentation schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Save the presentation schedule: [{ group_id | user_id, presentation_date }]
router.put('/eval-type/:evalTypeId/schedule', authenticateToken, async (req, res) => {
  try {
    if (!isTeacherOrAdmin(req)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const evalTypeId = parseInt(req.params.evalTypeId);
    const { slots } = req.body;
    if (!Array.isArray(slots)) {
      return res.status(400).json({ error: 'slots must be an array' });
    }
    for (const slot of slots) {
      if (slot.presentation_date && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(slot.presentation_date)) {
        return res.status(400).json({ error: 'presentation_date must be YYYY-MM-DDTHH:mm' });
      }
    }
    await audience.saveSchedule(evalTypeId, slots);

    const ctx = await audience.loadAudienceContext(evalTypeId);
    if (!ctx) {
      return res.status(404).json({ error: 'Eval type not found' });
    }
    res.json(formatSchedule(ctx));
  } catch (error) {
    console.error('Error saving presentation schedule:', error);
    res.status(500).json({ error: 'Failed to save schedule' });
  }
});

// Excuse students from evaluating given presenters (they were absent).
// Body: { excusals: [{ group_id | user_id (the presenter), student_ids: [...] }] }
// Each listed presenter's excused list is replaced in full.
router.put('/eval-type/:evalTypeId/excusals', authenticateToken, async (req, res) => {
  try {
    if (!isTeacherOrAdmin(req)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const evalTypeId = parseInt(req.params.evalTypeId);
    const { excusals } = req.body;
    if (!Array.isArray(excusals)) {
      return res.status(400).json({ error: 'excusals must be an array' });
    }
    await audience.saveExcusals(evalTypeId, excusals);

    const ctx = await audience.loadAudienceContext(evalTypeId);
    if (!ctx) {
      return res.status(404).json({ error: 'Eval type not found' });
    }
    res.json(formatSchedule(ctx));
  } catch (error) {
    console.error('Error saving excusals:', error);
    res.status(500).json({ error: 'Failed to save excused absences' });
  }
});

// Randomly assign presenters to students ('assigned' mode).
// Body: { scope: 'all' | 'unassigned' }  — 'unassigned' only fills in students with no assignments.
router.post('/eval-type/:evalTypeId/assignments', authenticateToken, async (req, res) => {
  try {
    if (!isTeacherOrAdmin(req)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const evalTypeId = parseInt(req.params.evalTypeId);
    const scope = req.body?.scope === 'unassigned' ? 'unassigned' : 'all';
    const result = await audience.assignPresentersRandomly(evalTypeId, scope);
    if (!result) {
      return res.status(404).json({ error: 'Eval type not found' });
    }
    const ctx = await audience.loadAudienceContext(evalTypeId);
    res.json({ ...formatSchedule(ctx), result });
  } catch (error) {
    console.error('Error assigning presenters:', error);
    res.status(500).json({ error: 'Failed to assign presenters' });
  }
});

// Remove all random assignments for a round
router.delete('/eval-type/:evalTypeId/assignments', authenticateToken, async (req, res) => {
  try {
    if (!isTeacherOrAdmin(req)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const evalTypeId = parseInt(req.params.evalTypeId);
    await audience.clearAssignments(evalTypeId);
    const ctx = await audience.loadAudienceContext(evalTypeId);
    if (!ctx) {
      return res.status(404).json({ error: 'Eval type not found' });
    }
    res.json(formatSchedule(ctx));
  } catch (error) {
    console.error('Error clearing assignments:', error);
    res.status(500).json({ error: 'Failed to clear assignments' });
  }
});

// What a student owes for an audience eval type: targets, dates, and counts
router.get('/eval-type/:evalTypeId/audience', authenticateToken, async (req, res) => {
  try {
    const evalTypeId = parseInt(req.params.evalTypeId);
    const studentId = isTeacherOrAdmin(req) && req.query.user_id ? parseInt(req.query.user_id) : req.user.id;

    const ctx = await audience.loadAudienceContext(evalTypeId);
    if (!ctx) {
      return res.status(404).json({ error: 'Eval type not found' });
    }
    if (!audience.isAudienceEvalType(ctx.evalType)) {
      return res.status(400).json({ error: 'Not an audience evaluation' });
    }

    const status = await audience.getStudentAudienceStatus(ctx, studentId);
    res.json({
      eval_type_id: evalTypeId,
      target_type: ctx.evalType.targetType,
      eval_window_hours: ctx.evalType.evalWindowHours,
      min_completion: ctx.evalType.minCompletion,
      allow_late: ctx.evalType.allowLate === 1,
      timezone: ctx.timezone,
      now: ctx.nowStr,
      ...status
    });
  } catch (error) {
    console.error('Error fetching audience status:', error);
    res.status(500).json({ error: 'Failed to fetch audience evaluation status' });
  }
});

// ==========================================
// ASSIGNMENT EVALUATIONS ENDPOINTS
// ==========================================

// Get student's evaluations for a class (assignment mode)
router.get('/evaluations/my/:classId', authenticateToken, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);
    const userId = req.query.user_id ? parseInt(req.query.user_id) : req.user.id;

    // Get all assignments for this class
    const assignments = await prisma.assignment.findMany({
      where: { classId },
      include: EVAL_TYPES_INCLUDE,
      orderBy: { orderIndex: 'asc' }
    });

    // Get user's group for this class
    const groupMember = await prisma.groupMember.findFirst({
      where: {
        userId,
        group: { classId }
      },
      include: {
        group: {
          include: {
            members: {
              include: { user: true }
            }
          }
        }
      }
    });

    // Students without a group can still take part in audience evaluations,
    // so a missing group is reported as null rather than an error.

    const evalTypeIds = assignments.flatMap(a => a.evalTypes.map(et => et.id));

    // Audience rounds: what this student owes and how far along they are
    const audienceSummaries = {};
    for (const a of assignments) {
      for (const et of a.evalTypes) {
        if (!audience.isAudienceEvalType(et)) continue;
        const ctx = await audience.loadAudienceContext(et.id);
        if (!ctx) continue;
        const { targets, ...summary } = await audience.getStudentAudienceStatus(ctx, userId);
        audienceSummaries[et.id] = summary;
      }
    }

    const [individualEvals, groupEvals] = await Promise.all([
      prisma.assignmentEvaluation.findMany({
        where: {
          evaluatorId: userId,
          evalTypeId: { in: evalTypeIds }
        },
        include: {
          scores: true,
          evalType: true
        }
      }),
      prisma.groupEvaluation.findMany({
        where: {
          evaluatorId: userId,
          evalTypeId: { in: evalTypeIds }
        },
        include: {
          scores: true,
          evalType: true
        }
      })
    ]);

    // Format response
    const formatWithAudience = (a) => {
      const formatted = formatAssignment(a);
      return {
        ...formatted,
        eval_types: formatted.eval_types.map(et => ({ ...et, audience: audienceSummaries[et.id] || null }))
      };
    };

    const result = {
      group: groupMember ? {
        id: groupMember.group.id,
        name: groupMember.group.name,
        members: groupMember.group.members.map(m => ({
          id: m.user.id,
          first_name: m.user.firstName,
          last_name: m.user.lastName,
          email: m.user.email
        }))
      } : null,
      assignments: assignments.map(a => ({
        ...formatWithAudience(a),
        evaluations: {
          individual: individualEvals
            .filter(e => a.evalTypes.some(et => et.id === e.evalTypeId))
            .map(e => ({
              id: e.id,
              evaluatee_id: e.evaluateeId,
              eval_type_id: e.evalTypeId,
              eval_type: e.evalType.evalType,
              comments: e.comments,
              submitted_at: e.submittedAt,
              is_late: e.isLate === 1,
              scores: e.scores.map(s => ({
                criterion_id: s.criterionId,
                score: s.score,
                text_response: s.textResponse || null
              }))
            })),
          group: groupEvals
            .filter(e => a.evalTypes.some(et => et.id === e.evalTypeId))
            .map(e => ({
              id: e.id,
              group_id: e.groupId,
              eval_type_id: e.evalTypeId,
              eval_type: e.evalType.evalType,
              comments: e.comments,
              submitted_at: e.submittedAt,
              is_late: e.isLate === 1,
              scores: e.scores.map(s => ({
                criterion_id: s.criterionId,
                score: s.score,
                text_response: s.textResponse || null
              }))
            }))
        }
      }))
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching assignment evaluations:', error);
    res.status(500).json({ error: 'Failed to fetch evaluations' });
  }
});

/**
 * Decide whether a submission is allowed and whether it counts as late.
 * Audience rounds enforce eligibility (no self / own group), the presentation
 * schedule, and per-presenter deadlines; other rounds use the round's date.
 */
async function checkSubmission(evalTypeId, evaluatorId, { groupId, evaluateeId }) {
  const evalType = await prisma.assignmentEvalType.findUnique({
    where: { id: evalTypeId },
    include: { assignment: { include: { class: { select: { dueDateTimezone: true } } } } }
  });
  if (!evalType) {
    return { ok: false, status: 404, error: 'Evaluation type not found' };
  }

  if (audience.isAudienceEvalType(evalType)) {
    const ctx = await audience.loadAudienceContext(evalTypeId);
    return audience.validateSubmission(ctx, evaluatorId, { groupId, evaluateeId });
  }

  const dueDate = evalType.dueDate || evalType.assignment?.dueDate;
  const classTimezone = evalType.assignment?.class?.dueDateTimezone;
  return { ok: true, isLate: isPastDueDate(dueDate, classTimezone) ? 1 : 0 };
}

// Submit an individual evaluation
router.post('/evaluations/individual', authenticateToken, async (req, res) => {
  try {
    const { evaluatee_id, eval_type_id, comments, scores } = req.body;
    const evaluatorId = req.user.id;

    // Check if evaluation already exists
    const existing = await prisma.assignmentEvaluation.findUnique({
      where: {
        evaluatorId_evaluateeId_evalTypeId: {
          evaluatorId,
          evaluateeId: evaluatee_id,
          evalTypeId: eval_type_id
        }
      }
    });

    const lateness = await checkSubmission(eval_type_id, evaluatorId, { evaluateeId: evaluatee_id });
    if (!lateness.ok) {
      return res.status(lateness.status).json({ error: lateness.error });
    }
    const { isLate } = lateness;

    let evaluation;
    if (existing) {
      // Update existing
      evaluation = await prisma.assignmentEvaluation.update({
        where: { id: existing.id },
        data: {
          comments,
          updatedAt: new Date(),
          submittedAt: new Date(),
          isLate
        }
      });

      // Update scores
      if (scores && scores.length > 0) {
        for (const score of scores) {
          await prisma.assignmentEvaluationScore.upsert({
            where: {
              evaluationId_criterionId: {
                evaluationId: evaluation.id,
                criterionId: score.criterion_id
              }
            },
            update: {
              score: score.score != null ? score.score : null,
              textResponse: score.text_response || null
            },
            create: {
              evaluationId: evaluation.id,
              criterionId: score.criterion_id,
              score: score.score != null ? score.score : null,
              textResponse: score.text_response || null
            }
          });
        }
      }
    } else {
      // Create new
      evaluation = await prisma.assignmentEvaluation.create({
        data: {
          evaluatorId,
          evaluateeId: evaluatee_id,
          evalTypeId: eval_type_id,
          comments,
          submittedAt: new Date(),
          isLate,
          scores: scores ? {
            create: scores.map(s => ({
              criterionId: s.criterion_id,
              score: s.score != null ? s.score : null,
              textResponse: s.text_response || null
            }))
          } : undefined
        }
      });
    }

    // Fetch complete evaluation
    const result = await prisma.assignmentEvaluation.findUnique({
      where: { id: evaluation.id },
      include: { scores: true }
    });

    res.json({
      id: result.id,
      evaluatee_id: result.evaluateeId,
      eval_type_id: result.evalTypeId,
      comments: result.comments,
      submitted_at: result.submittedAt,
      is_late: result.isLate === 1,
      scores: result.scores.map(s => ({
        criterion_id: s.criterionId,
        score: s.score,
        text_response: s.textResponse || null
      }))
    });
  } catch (error) {
    console.error('Error saving individual evaluation:', error);
    res.status(500).json({ error: 'Failed to save evaluation' });
  }
});

// Submit a group evaluation
router.post('/evaluations/group', authenticateToken, async (req, res) => {
  try {
    const { group_id, eval_type_id, comments, scores } = req.body;
    const evaluatorId = req.user.id;

    // Check if evaluation already exists
    const existing = await prisma.groupEvaluation.findUnique({
      where: {
        evaluatorId_groupId_evalTypeId: {
          evaluatorId,
          groupId: group_id,
          evalTypeId: eval_type_id
        }
      }
    });

    const lateness = await checkSubmission(eval_type_id, evaluatorId, { groupId: group_id });
    if (!lateness.ok) {
      return res.status(lateness.status).json({ error: lateness.error });
    }
    const { isLate } = lateness;

    let evaluation;
    if (existing) {
      // Update existing
      evaluation = await prisma.groupEvaluation.update({
        where: { id: existing.id },
        data: {
          comments,
          updatedAt: new Date(),
          submittedAt: new Date(),
          isLate
        }
      });

      // Update scores
      if (scores && scores.length > 0) {
        for (const score of scores) {
          await prisma.groupEvaluationScore.upsert({
            where: {
              groupEvaluationId_criterionId: {
                groupEvaluationId: evaluation.id,
                criterionId: score.criterion_id
              }
            },
            update: {
              score: score.score != null ? score.score : null,
              textResponse: score.text_response || null
            },
            create: {
              groupEvaluationId: evaluation.id,
              criterionId: score.criterion_id,
              score: score.score != null ? score.score : null,
              textResponse: score.text_response || null
            }
          });
        }
      }
    } else {
      // Create new
      evaluation = await prisma.groupEvaluation.create({
        data: {
          evaluatorId,
          groupId: group_id,
          evalTypeId: eval_type_id,
          comments,
          submittedAt: new Date(),
          isLate,
          scores: scores ? {
            create: scores.map(s => ({
              criterionId: s.criterion_id,
              score: s.score != null ? s.score : null,
              textResponse: s.text_response || null
            }))
          } : undefined
        }
      });
    }

    // Fetch complete evaluation
    const result = await prisma.groupEvaluation.findUnique({
      where: { id: evaluation.id },
      include: { scores: true }
    });

    res.json({
      id: result.id,
      group_id: result.groupId,
      eval_type_id: result.evalTypeId,
      comments: result.comments,
      submitted_at: result.submittedAt,
      is_late: result.isLate === 1,
      scores: result.scores.map(s => ({
        criterion_id: s.criterionId,
        score: s.score,
        text_response: s.textResponse || null
      }))
    });
  } catch (error) {
    console.error('Error saving group evaluation:', error);
    res.status(500).json({ error: 'Failed to save evaluation' });
  }
});

// Get all groups for a class (for audience evaluations)
router.get('/groups/:classId', authenticateToken, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);

    const groups = await prisma.group.findMany({
      where: { classId },
      include: {
        members: {
          include: { user: true }
        }
      }
    });

    res.json(groups.map(g => ({
      id: g.id,
      name: g.name,
      members: g.members.map(m => ({
        id: m.user.id,
        first_name: m.user.firstName,
        last_name: m.user.lastName,
        email: m.user.email
      }))
    })));
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get all evaluations for a class (admin view)
router.get('/evaluations/admin/:classId', authenticateToken, async (req, res) => {
  try {
    // Verify admin or teacher
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const classId = parseInt(req.params.classId);

    // Get all assignments for this class
    const assignments = await prisma.assignment.findMany({
      where: { classId },
      include: EVAL_TYPES_INCLUDE,
      orderBy: { orderIndex: 'asc' }
    });

    const evalTypeIds = assignments.flatMap(a => a.evalTypes.map(et => et.id));

    // Per-student audience progress (eligible / required / completed), keyed by eval type
    const audienceProgress = {};
    for (const a of assignments) {
      for (const et of a.evalTypes) {
        if (!audience.isAudienceEvalType(et)) continue;
        const ctx = await audience.loadAudienceContext(et.id);
        if (ctx) audienceProgress[et.id] = await audience.getClassAudienceProgress(ctx);
      }
    }

    // Get all individual evaluations for this class
    const [individualEvals, groupEvals] = await Promise.all([
      prisma.assignmentEvaluation.findMany({
        where: {
          evalTypeId: { in: evalTypeIds }
        },
        include: {
          evaluator: true,
          evaluatee: true,
          evalType: {
            include: {
              assignment: true
            }
          },
          scores: {
            include: {
              criterion: true
            }
          },
          attachments: true
        }
      }),
      prisma.groupEvaluation.findMany({
        where: {
          evalTypeId: { in: evalTypeIds }
        },
        include: {
          evaluator: true,
          group: true,
          evalType: {
            include: {
              assignment: true
            }
          },
          scores: {
            include: {
              criterion: true
            }
          },
          attachments: true
        }
      })
    ]);

    // Format individual evaluations with attachments
    const formattedIndividual = await Promise.all(individualEvals.map(async (e) => {
      // Generate presigned URLs for attachments
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

      const likertScores = e.scores.filter(s => (s.criterion.questionType || 'likert') === 'likert' && s.score != null);
      return {
        id: e.id,
        assignment_id: e.evalType.assignmentId,
        assignment_name: e.evalType.assignment.name,
        eval_type_id: e.evalTypeId,
        eval_type: e.evalType.evalType,
        eval_type_name: e.evalType.name,
        evaluator_id: e.evaluatorId,
        evaluator_name: `${e.evaluator.firstName} ${e.evaluator.lastName}`,
        evaluatee_id: e.evaluateeId,
        evaluatee_name: `${e.evaluatee.firstName} ${e.evaluatee.lastName}`,
        comments: e.comments,
        submitted_at: e.submittedAt,
        is_late: e.isLate === 1,
        scores: e.scores.map(s => ({
          criterion_id: s.criterionId,
          criterion_name: s.criterion.name,
          score: s.score,
          max_value: s.criterion.maxValue,
          question_type: s.criterion.questionType || 'likert',
          text_response: s.textResponse || null
        })),
        avg_score: likertScores.length > 0
          ? likertScores.reduce((sum, s) => sum + s.score, 0) / likertScores.length
          : null,
        attachments: attachmentsWithUrls
      };
    }));

    // Format group evaluations with attachments
    const formattedGroup = await Promise.all(groupEvals.map(async (e) => {
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

      const likertScores = e.scores.filter(s => (s.criterion.questionType || 'likert') === 'likert' && s.score != null);
      return {
        id: e.id,
        assignment_id: e.evalType.assignmentId,
        assignment_name: e.evalType.assignment.name,
        eval_type_id: e.evalTypeId,
        eval_type: e.evalType.evalType,
        eval_type_name: e.evalType.name,
        evaluator_id: e.evaluatorId,
        evaluator_name: `${e.evaluator.firstName} ${e.evaluator.lastName}`,
        group_id: e.groupId,
        group_name: e.group.name,
        comments: e.comments,
        submitted_at: e.submittedAt,
        is_late: e.isLate === 1,
        scores: e.scores.map(s => ({
          criterion_id: s.criterionId,
          criterion_name: s.criterion.name,
          score: s.score,
          max_value: s.criterion.maxValue,
          question_type: s.criterion.questionType || 'likert',
          text_response: s.textResponse || null
        })),
        avg_score: likertScores.length > 0
          ? likertScores.reduce((sum, s) => sum + s.score, 0) / likertScores.length
          : null,
        attachments: attachmentsWithUrls
      };
    }));

    res.json({
      assignments: assignments.map(formatAssignment),
      individual_evaluations: formattedIndividual,
      group_evaluations: formattedGroup,
      audience_progress: audienceProgress
    });
  } catch (error) {
    console.error('Error fetching admin evaluations:', error);
    res.status(500).json({ error: 'Failed to fetch evaluations' });
  }
});

// Check if an eval type is past due
router.get('/evaluations/is-read-only', authenticateToken, async (req, res) => {
  try {
    const evalTypeId = parseInt(req.query.eval_type_id);

    const evalType = await prisma.assignmentEvalType.findUnique({
      where: { id: evalTypeId },
      include: { assignment: { include: { class: { select: { dueDateTimezone: true } } } } }
    });

    if (!evalType) {
      return res.status(404).json({ error: 'Eval type not found' });
    }

    const dueDate = evalType.dueDate || evalType.assignment?.dueDate;
    if (!dueDate) {
      return res.json({ isReadOnly: false, dueDate: null });
    }

    const classTimezone = evalType.assignment?.class?.dueDateTimezone;
    const pastDue = isPastDueDate(dueDate, classTimezone);
    const isReadOnly = pastDue && evalType.allowLate !== 1;

    res.json({
      isReadOnly,
      dueDate,
      allowLate: evalType.allowLate === 1
    });
  } catch (error) {
    console.error('Error checking read-only status:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// ==========================================
// ASSIGNMENT EVALUATION ATTACHMENT ENDPOINTS
// ==========================================

// Upload image to an assignment evaluation (individual)
router.post('/evaluations/individual/:evaluationId/attachments', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!isS3Configured()) {
      return res.status(503).json({ error: 'Image uploads not configured' });
    }

    const evaluationId = parseInt(req.params.evaluationId);

    // Verify the evaluation exists and belongs to the user
    const evaluation = await prisma.assignmentEvaluation.findUnique({
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
    const s3Key = generateS3Key('assignment', evaluationId, req.file.originalname);
    const uploadResult = await uploadFile(req.file.buffer, s3Key, req.file.mimetype);

    if (!uploadResult.success) {
      return res.status(500).json({ error: uploadResult.error });
    }

    // Save attachment record
    const attachment = await prisma.assignmentEvaluationAttachment.create({
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

// Get attachments for an assignment evaluation (individual)
router.get('/evaluations/individual/:evaluationId/attachments', authenticateToken, async (req, res) => {
  try {
    const evaluationId = parseInt(req.params.evaluationId);

    const evaluation = await prisma.assignmentEvaluation.findUnique({
      where: { id: evaluationId },
      include: { attachments: true },
    });

    if (!evaluation) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }

    // Only evaluator, evaluatee, teacher, or admin can view
    const isAuthorized =
      evaluation.evaluatorId === req.user.id ||
      evaluation.evaluateeId === req.user.id ||
      req.user.role === 'admin' ||
      req.user.role === 'teacher';

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Not authorized to view attachments' });
    }

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

// Delete an assignment evaluation attachment
router.delete('/evaluations/individual/attachments/:attachmentId', authenticateToken, async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);

    const attachment = await prisma.assignmentEvaluationAttachment.findUnique({
      where: { id: attachmentId },
      include: { evaluation: true },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (attachment.evaluation.evaluatorId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Not authorized to delete this attachment' });
    }

    await deleteFile(attachment.s3Key);
    await prisma.assignmentEvaluationAttachment.delete({
      where: { id: attachmentId },
    });

    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    console.error('Delete attachment error:', err);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// Upload image to a group evaluation
router.post('/evaluations/group/:evaluationId/attachments', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!isS3Configured()) {
      return res.status(503).json({ error: 'Image uploads not configured' });
    }

    const evaluationId = parseInt(req.params.evaluationId);

    const evaluation = await prisma.groupEvaluation.findUnique({
      where: { id: evaluationId },
      include: { attachments: true },
    });

    if (!evaluation) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }

    if (evaluation.evaluatorId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Not authorized to upload to this evaluation' });
    }

    if (evaluation.attachments.length >= MAX_FILES_PER_EVALUATION) {
      return res.status(400).json({
        error: `Maximum ${MAX_FILES_PER_EVALUATION} images allowed per evaluation`,
      });
    }

    const validation = validateFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const s3Key = generateS3Key('group', evaluationId, req.file.originalname);
    const uploadResult = await uploadFile(req.file.buffer, s3Key, req.file.mimetype);

    if (!uploadResult.success) {
      return res.status(500).json({ error: uploadResult.error });
    }

    const attachment = await prisma.groupEvaluationAttachment.create({
      data: {
        groupEvaluationId: evaluationId,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        s3Key,
      },
    });

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

// Get attachments for a group evaluation
router.get('/evaluations/group/:evaluationId/attachments', authenticateToken, async (req, res) => {
  try {
    const evaluationId = parseInt(req.params.evaluationId);

    const evaluation = await prisma.groupEvaluation.findUnique({
      where: { id: evaluationId },
      include: { attachments: true },
    });

    if (!evaluation) {
      return res.status(404).json({ error: 'Evaluation not found' });
    }

    // For group evals, allow evaluator, teacher, or admin
    const isAuthorized =
      evaluation.evaluatorId === req.user.id ||
      req.user.role === 'admin' ||
      req.user.role === 'teacher';

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Not authorized to view attachments' });
    }

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

// Delete a group evaluation attachment
router.delete('/evaluations/group/attachments/:attachmentId', authenticateToken, async (req, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId);

    const attachment = await prisma.groupEvaluationAttachment.findUnique({
      where: { id: attachmentId },
      include: { groupEvaluation: true },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (attachment.groupEvaluation.evaluatorId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Not authorized to delete this attachment' });
    }

    await deleteFile(attachment.s3Key);
    await prisma.groupEvaluationAttachment.delete({
      where: { id: attachmentId },
    });

    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    console.error('Delete attachment error:', err);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

module.exports = router;
