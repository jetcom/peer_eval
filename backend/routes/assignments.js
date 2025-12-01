const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { authenticateToken } = require('../middleware/auth');

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
    criteria: et.criteria?.map(c => ({
      id: c.id,
      eval_type_id: c.evalTypeId,
      name: c.name,
      description: c.description,
      order_index: c.orderIndex,
      min_value: c.minValue,
      max_value: c.maxValue
    })) || []
  })) || []
});

// Get all assignments for a class
router.get('/class/:classId', authenticateToken, async (req, res) => {
  try {
    const classId = parseInt(req.params.classId);

    const assignments = await prisma.assignment.findMany({
      where: { classId },
      include: {
        evalTypes: {
          include: {
            criteria: {
              orderBy: { orderIndex: 'asc' }
            }
          }
        }
      },
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
      include: {
        evalTypes: {
          include: {
            criteria: {
              orderBy: { orderIndex: 'asc' }
            }
          }
        },
        class: true
      }
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
            criteria: et.criteria ? {
              create: et.criteria.map((c, idx) => ({
                name: c.name,
                description: c.description || null,
                orderIndex: c.order_index || idx,
                minValue: c.min_value || 1,
                maxValue: c.max_value || 5
              }))
            } : undefined
          }))
        } : undefined
      },
      include: {
        evalTypes: {
          include: {
            criteria: {
              orderBy: { orderIndex: 'asc' }
            }
          }
        }
      }
    });

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
      include: {
        evalTypes: {
          include: {
            criteria: {
              orderBy: { orderIndex: 'asc' }
            }
          }
        }
      }
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
      include: {
        evalTypes: {
          include: {
            criteria: true
          }
        }
      },
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

    if (!groupMember) {
      return res.status(404).json({ error: 'User not in a group for this class' });
    }

    // Get all individual evaluations by this user for this class's eval types
    const evalTypeIds = assignments.flatMap(a => a.evalTypes.map(et => et.id));

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
    const result = {
      group: {
        id: groupMember.group.id,
        name: groupMember.group.name,
        members: groupMember.group.members.map(m => ({
          id: m.user.id,
          first_name: m.user.firstName,
          last_name: m.user.lastName,
          email: m.user.email
        }))
      },
      assignments: assignments.map(a => ({
        ...formatAssignment(a),
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
                score: s.score
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
                score: s.score
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

    // Get eval type to check due date
    const evalType = await prisma.assignmentEvalType.findUnique({
      where: { id: eval_type_id },
      include: { assignment: true }
    });

    // Determine if late
    let isLate = 0;
    const dueDate = evalType?.dueDate || evalType?.assignment?.dueDate;
    if (dueDate) {
      const now = new Date().toISOString();
      if (now > dueDate) {
        isLate = 1;
      }
    }

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
            update: { score: score.score },
            create: {
              evaluationId: evaluation.id,
              criterionId: score.criterion_id,
              score: score.score
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
              score: s.score
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
        score: s.score
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

    // Get eval type to check due date
    const evalType = await prisma.assignmentEvalType.findUnique({
      where: { id: eval_type_id },
      include: { assignment: true }
    });

    // Determine if late
    let isLate = 0;
    const dueDate = evalType?.dueDate || evalType?.assignment?.dueDate;
    if (dueDate) {
      const now = new Date().toISOString();
      if (now > dueDate) {
        isLate = 1;
      }
    }

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
            update: { score: score.score },
            create: {
              groupEvaluationId: evaluation.id,
              criterionId: score.criterion_id,
              score: score.score
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
              score: s.score
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
        score: s.score
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
      include: {
        evalTypes: {
          include: {
            criteria: true
          }
        }
      }
    });

    const evalTypeIds = assignments.flatMap(a => a.evalTypes.map(et => et.id));

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
          }
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
          }
        }
      })
    ]);

    // Format individual evaluations
    const formattedIndividual = individualEvals.map(e => ({
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
        max_value: s.criterion.maxValue
      })),
      avg_score: e.scores.length > 0
        ? e.scores.reduce((sum, s) => sum + s.score, 0) / e.scores.length
        : null
    }));

    // Format group evaluations
    const formattedGroup = groupEvals.map(e => ({
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
        max_value: s.criterion.maxValue
      })),
      avg_score: e.scores.length > 0
        ? e.scores.reduce((sum, s) => sum + s.score, 0) / e.scores.length
        : null
    }));

    res.json({
      assignments: assignments.map(formatAssignment),
      individual_evaluations: formattedIndividual,
      group_evaluations: formattedGroup
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
      include: { assignment: true }
    });

    if (!evalType) {
      return res.status(404).json({ error: 'Eval type not found' });
    }

    const dueDate = evalType.dueDate || evalType.assignment?.dueDate;
    if (!dueDate) {
      return res.json({ isReadOnly: false, dueDate: null });
    }

    const now = new Date().toISOString();
    const isReadOnly = now > dueDate && evalType.allowLate !== 1;

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

module.exports = router;
