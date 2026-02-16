const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/email');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to check if user is teacher or admin
const requireTeacherOrAdmin = (req, res, next) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Teacher or admin access required' });
  }
  next();
};

// Helper to format class response for backwards compatibility
const formatClassResponse = (c) => ({
  id: c.id,
  name: c.name,
  section: c.section,
  semester: c.semester,
  teacher_id: c.teacherId,
  num_phases: c.numPhases,
  has_final_evaluation: c.hasFinalEvaluation,
  due_date: c.dueDate,
  due_date_timezone: c.dueDateTimezone,
  archived: c.archived,
  min_comment_words: c.minCommentWords,
  evaluation_mode: c.evaluationMode,
  allow_late: c.allowLate,
  late_window_hours: c.lateWindowHours,
  include_self_eval: c.includeSelfEval,
  peer_template_id: c.peerTemplateId,
  audience_template_id: c.audienceTemplateId,
  self_template_id: c.selfTemplateId,
  paper_review_template_id: c.paperReviewTemplateId,
  created_at: c.createdAt,
  teacher_name: c.teacher ? `${c.teacher.firstName} ${c.teacher.lastName}`.trim() : undefined,
  teacher_email: c.teacher?.email,
  student_count: c._count?.enrollments,
  group_count: c._count?.groups,
  instructors: c.instructors?.map(i => ({
    id: i.user.id,
    first_name: i.user.firstName,
    last_name: i.user.lastName,
    email: i.user.email
  })),
  phase_due_dates: c.phaseDueDates?.reduce((acc, pd) => {
    acc[pd.phase] = pd.dueDate;
    return acc;
  }, {})
});

// Get all classes (admin sees all, teacher sees their own)
router.get('/', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const includeArchived = req.query.include_archived === 'true';

    const where = {};
    if (req.user.role !== 'admin') {
      where.teacherId = req.user.id;
    }
    if (!includeArchived) {
      where.archived = 0;
    }

    const classes = await prisma.class.findMany({
      where,
      include: {
        teacher: {
          select: { firstName: true, lastName: true, email: true }
        },
        _count: {
          select: { enrollments: true, groups: true }
        }
      },
      orderBy: [
        { archived: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    res.json(classes.map(formatClassResponse));
  } catch (err) {
    console.error('Get classes error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get instructors for a class
router.get('/:id/instructors', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const instructors = await prisma.classInstructor.findMany({
      where: { classId: id },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true }
        }
      },
      orderBy: [
        { user: { lastName: 'asc' } },
        { user: { firstName: 'asc' } }
      ]
    });

    res.json(instructors.map(i => ({
      id: i.user.id,
      first_name: i.user.firstName,
      last_name: i.user.lastName,
      email: i.user.email
    })));
  } catch (err) {
    console.error('Get instructors error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get class config (accessible by any authenticated user enrolled in the class)
router.get('/:id/config', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const isTeacherOrAdmin = req.user.role === 'admin' || req.user.role === 'teacher';

    let classData;
    if (isTeacherOrAdmin) {
      classData = await prisma.class.findUnique({
        where: { id },
        select: { minCommentWords: true }
      });
    } else {
      const enrollment = await prisma.classEnrollment.findFirst({
        where: { classId: id, userId: req.user.id },
        include: {
          class: { select: { minCommentWords: true } }
        }
      });
      classData = enrollment?.class;
    }

    if (!classData) {
      return res.status(404).json({ error: 'Class not found or not enrolled' });
    }

    res.json({ min_comment_words: classData.minCommentWords || 0 });
  } catch (err) {
    console.error('Get class config error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get single class with details
router.get('/:id', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const where = { id };
    if (req.user.role !== 'admin') {
      where.teacherId = req.user.id;
    }

    const classData = await prisma.class.findFirst({
      where,
      include: {
        instructors: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } }
          }
        },
        phaseDueDates: true
      }
    });

    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    res.json(formatClassResponse(classData));
  } catch (err) {
    console.error('Get class error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create class
router.post('/', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const {
      name, section, semester, num_phases, has_final_evaluation, due_date_timezone,
      instructor_ids, phase_due_dates, min_comment_words, evaluation_mode, allow_late,
      late_window_hours, include_self_eval, peer_template_id, audience_template_id,
      self_template_id, paper_review_template_id, assignments
    } = req.body;
    const teacher_id = req.user.role === 'admin' && req.body.teacher_id
      ? req.body.teacher_id
      : req.user.id;

    const classData = await prisma.class.create({
      data: {
        name,
        section: section || null,
        semester: semester || null,
        teacherId: teacher_id,
        numPhases: num_phases || 3,
        hasFinalEvaluation: has_final_evaluation !== undefined ? has_final_evaluation : 1,
        dueDateTimezone: due_date_timezone || null,
        minCommentWords: min_comment_words || 0,
        evaluationMode: evaluation_mode || 'phases',
        allowLate: allow_late !== undefined ? allow_late : 1,
        lateWindowHours: late_window_hours || 48,
        includeSelfEval: include_self_eval || 0,
        peerTemplateId: peer_template_id || null,
        audienceTemplateId: audience_template_id || null,
        selfTemplateId: self_template_id || null,
        paperReviewTemplateId: paper_review_template_id || null
      }
    });

    // Save phase due dates if provided
    if (phase_due_dates && typeof phase_due_dates === 'object') {
      const phases = Object.keys(phase_due_dates).filter(p => phase_due_dates[p]);
      if (phases.length > 0) {
        await prisma.phaseDueDate.createMany({
          data: phases.map(phase => ({
            classId: classData.id,
            phase: parseInt(phase),
            dueDate: phase_due_dates[phase]
          }))
        });
      }
    }

    // Add instructors
    const instructorList = instructor_ids && Array.isArray(instructor_ids) ? instructor_ids : [teacher_id];
    if (instructorList.length > 0) {
      // Use upsert instead of createMany with skipDuplicates (SQLite doesn't support skipDuplicates)
      for (const instructorId of instructorList) {
        await prisma.classInstructor.upsert({
          where: {
            classId_userId: {
              classId: classData.id,
              userId: instructorId
            }
          },
          update: {},
          create: {
            classId: classData.id,
            userId: instructorId
          }
        });
      }
    }

    // Create assignments if provided (for assignment-mode classes)
    if (assignments && Array.isArray(assignments) && assignments.length > 0) {
      // Fetch templates to get criteria — include both class-level and per-assignment template IDs
      const templateIds = new Set([peer_template_id, audience_template_id, self_template_id, paper_review_template_id].filter(Boolean));
      for (const a of assignments) {
        if (a.template_ids) {
          Object.values(a.template_ids).filter(Boolean).forEach(id => templateIds.add(id));
        }
      }
      let templateMap = {};

      if (templateIds.size > 0) {
        const templates = await prisma.evalTemplate.findMany({
          where: { id: { in: [...templateIds] } },
          include: { criteria: { orderBy: { orderIndex: 'asc' } } }
        });
        templateMap = templates.reduce((acc, t) => { acc[t.id] = t; return acc; }, {});
      }

      // Also get default system templates if no custom ones specified
      const defaultTemplates = await prisma.evalTemplate.findMany({
        where: { isSystem: 1 },
        include: { criteria: { orderBy: { orderIndex: 'asc' } } }
      });
      // Find default system templates by target type (first system template of each type)
      const defaultPeerTemplate = defaultTemplates.find(t => t.targetType === 'individual');
      const defaultAudienceTemplate = defaultTemplates.find(t => t.targetType === 'group');

      for (let i = 0; i < assignments.length; i++) {
        const assignment = assignments[i];
        // Create the assignment
        const createdAssignment = await prisma.assignment.create({
          data: {
            classId: classData.id,
            name: assignment.name,
            description: assignment.description || null,
            dueDate: assignment.due_date || null,
            orderIndex: assignment.order_index !== undefined ? assignment.order_index : i
          }
        });

        // Create eval types for this assignment
        if (assignment.eval_types && Array.isArray(assignment.eval_types)) {
          for (let j = 0; j < assignment.eval_types.length; j++) {
            const evalType = assignment.eval_types[j];
            // eval_types from wizard is just an array of strings like ['peer', 'audience']
            const evalTypeStr = typeof evalType === 'string' ? evalType : evalType.eval_type;

            // Determine which template to use for criteria
            // Check per-assignment template_ids first, then fall back to class-level defaults
            const perAssignmentId = assignment.template_ids && assignment.template_ids[evalTypeStr];
            let template = perAssignmentId ? templateMap[perAssignmentId] : null;
            if (!template) {
              if (evalTypeStr === 'audience') {
                template = templateMap[audience_template_id] || defaultAudienceTemplate;
              } else if (evalTypeStr === 'self') {
                template = templateMap[self_template_id] || templateMap[peer_template_id] || defaultPeerTemplate;
              } else if (evalTypeStr === 'paper_review') {
                template = templateMap[paper_review_template_id] || templateMap[peer_template_id] || defaultPeerTemplate;
              } else {
                // peer
                template = templateMap[peer_template_id] || defaultPeerTemplate;
              }
            }

            const createdEvalType = await prisma.assignmentEvalType.create({
              data: {
                assignmentId: createdAssignment.id,
                name: evalTypeStr === 'peer' ? 'Peer Evaluation' :
                      evalTypeStr === 'audience' ? 'Audience Evaluation' :
                      evalTypeStr === 'self' ? 'Self Evaluation' :
                      evalTypeStr === 'paper_review' ? 'Paper Review' : evalTypeStr,
                evalType: evalTypeStr,
                targetType: evalTypeStr === 'audience' ? 'group' : 'individual',
                includeSelf: evalTypeStr === 'self' ? 1 : 0
              }
            });

            // Create PaperReviewRound for paper_review eval types
            if (evalTypeStr === 'paper_review') {
              await prisma.paperReviewRound.create({
                data: {
                  evalTypeId: createdEvalType.id,
                  submissionDeadline: assignment.due_date || null
                }
              });
            }

            // Copy criteria from template
            if (template && template.criteria && template.criteria.length > 0) {
              for (let k = 0; k < template.criteria.length; k++) {
                const c = template.criteria[k];
                await prisma.assignmentEvalTypeCriteria.create({
                  data: {
                    evalTypeId: createdEvalType.id,
                    name: c.name,
                    description: c.description || null,
                    minValue: c.minValue || 1,
                    maxValue: c.maxValue || 5,
                    orderIndex: c.orderIndex || k,
                    questionType: c.questionType || 'likert'
                  }
                });
              }
            }
          }
        }
      }
    }

    res.json({
      id: classData.id,
      name,
      section,
      semester,
      teacher_id,
      num_phases: num_phases || 3,
      has_final_evaluation: has_final_evaluation !== undefined ? has_final_evaluation : 1,
      due_date_timezone: due_date_timezone || null,
      phase_due_dates: phase_due_dates || {}
    });
  } catch (err) {
    console.error('Create class error:', err);
    res.status(500).json({ error: 'Failed to create class' });
  }
});

// Update class
router.put('/:id', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      name, section, semester, num_phases, has_final_evaluation, due_date_timezone,
      instructor_ids, phase_due_dates, min_comment_words, evaluation_mode, allow_late,
      late_window_hours, include_self_eval, peer_template_id, audience_template_id,
      self_template_id, paper_review_template_id
    } = req.body;

    // Check ownership if not admin
    const where = { id };
    if (req.user.role !== 'admin') {
      where.teacherId = req.user.id;
    }

    const existingClass = await prisma.class.findFirst({ where });
    if (!existingClass) {
      return res.status(404).json({ error: 'Class not found or access denied' });
    }

    // Check if evaluation_mode is being changed
    if (evaluation_mode && evaluation_mode !== existingClass.evaluationMode) {
      // Check if any evaluations exist for this class
      let hasEvaluations = false;

      if (existingClass.evaluationMode === 'phases') {
        // Check phase-based evaluations
        const evalCount = await prisma.evaluation.count({
          where: { classId: id }
        });
        hasEvaluations = evalCount > 0;
      } else {
        // Check assignment-based evaluations
        const assignments = await prisma.assignment.findMany({
          where: { classId: id },
          select: { id: true }
        });
        const assignmentIds = assignments.map(a => a.id);

        if (assignmentIds.length > 0) {
          const evalTypes = await prisma.assignmentEvalType.findMany({
            where: { assignmentId: { in: assignmentIds } },
            select: { id: true }
          });
          const evalTypeIds = evalTypes.map(e => e.id);

          if (evalTypeIds.length > 0) {
            const [indivCount, groupCount] = await Promise.all([
              prisma.individualGroupEvaluation.count({
                where: { evalTypeId: { in: evalTypeIds } }
              }),
              prisma.groupEvaluation.count({
                where: { evalTypeId: { in: evalTypeIds } }
              })
            ]);
            hasEvaluations = indivCount > 0 || groupCount > 0;
          }
        }
      }

      if (hasEvaluations) {
        return res.status(400).json({
          error: 'Cannot change evaluation mode after evaluations have been submitted'
        });
      }
    }

    await prisma.class.update({
      where: { id },
      data: {
        name,
        section: section || null,
        semester: semester || null,
        numPhases: num_phases || 3,
        hasFinalEvaluation: has_final_evaluation !== undefined ? has_final_evaluation : 1,
        dueDateTimezone: due_date_timezone || null,
        minCommentWords: min_comment_words || 0,
        evaluationMode: evaluation_mode || 'phases',
        allowLate: allow_late !== undefined ? allow_late : 1,
        lateWindowHours: late_window_hours || 48,
        includeSelfEval: include_self_eval || 0,
        peerTemplateId: peer_template_id || null,
        audienceTemplateId: audience_template_id || null,
        selfTemplateId: self_template_id || null,
        paperReviewTemplateId: paper_review_template_id || null
      }
    });

    // Update phase due dates
    if (phase_due_dates && typeof phase_due_dates === 'object') {
      await prisma.phaseDueDate.deleteMany({ where: { classId: id } });

      const phases = Object.keys(phase_due_dates).filter(p => phase_due_dates[p]);
      if (phases.length > 0) {
        await prisma.phaseDueDate.createMany({
          data: phases.map(phase => ({
            classId: id,
            phase: parseInt(phase),
            dueDate: phase_due_dates[phase]
          }))
        });
      }
    }

    // Update instructors if provided
    if (instructor_ids && Array.isArray(instructor_ids)) {
      await prisma.classInstructor.deleteMany({ where: { classId: id } });

      if (instructor_ids.length > 0) {
        await prisma.classInstructor.createMany({
          data: instructor_ids.map(instructorId => ({
            classId: id,
            userId: instructorId
          }))
        });
      }
    }

    res.json({
      id,
      name,
      section,
      semester,
      num_phases: num_phases || 3,
      has_final_evaluation: has_final_evaluation !== undefined ? has_final_evaluation : 1,
      due_date_timezone: due_date_timezone || null,
      phase_due_dates: phase_due_dates || {}
    });
  } catch (err) {
    console.error('Update class error:', err);
    res.status(500).json({ error: 'Failed to update class' });
  }
});

// Delete class
router.delete('/:id', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const where = { id };
    if (req.user.role !== 'admin') {
      where.teacherId = req.user.id;
    }

    const existingClass = await prisma.class.findFirst({ where });
    if (!existingClass) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Delete in transaction (cascades handle most of it)
    await prisma.$transaction([
      prisma.groupMember.deleteMany({
        where: { group: { classId: id } }
      }),
      prisma.class.delete({ where: { id } })
    ]);

    res.json({ message: 'Class deleted' });
  } catch (err) {
    console.error('Delete class error:', err);
    res.status(500).json({ error: 'Failed to delete class' });
  }
});

// Archive/unarchive a class
router.put('/:id/archive', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { archived } = req.body;

    const where = { id };
    if (req.user.role !== 'admin') {
      where.teacherId = req.user.id;
    }

    const existingClass = await prisma.class.findFirst({ where });
    if (!existingClass) {
      return res.status(404).json({ error: 'Class not found' });
    }

    await prisma.class.update({
      where: { id },
      data: { archived: archived ? 1 : 0 }
    });

    res.json({ message: archived ? 'Class archived' : 'Class restored', archived: archived ? 1 : 0 });
  } catch (err) {
    console.error('Archive class error:', err);
    res.status(500).json({ error: 'Failed to update class' });
  }
});

// Get students in a class
router.get('/:id/students', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId: id },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true }
        }
      },
      orderBy: [
        { user: { lastName: 'asc' } },
        { user: { firstName: 'asc' } }
      ]
    });

    res.json(enrollments.map(e => ({
      id: e.user.id,
      email: e.user.email,
      first_name: e.user.firstName,
      last_name: e.user.lastName,
      role: e.user.role,
      enrolled_at: e.createdAt
    })));
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Add student to class
router.post('/:id/students', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { user_id } = req.body;

    await prisma.classEnrollment.upsert({
      where: {
        classId_userId: { classId: id, userId: user_id }
      },
      update: {},
      create: { classId: id, userId: user_id }
    });

    res.json({ message: 'Student added to class' });
  } catch (err) {
    console.error('Add student error:', err);
    res.status(500).json({ error: 'Failed to add student' });
  }
});

// Remove student from class
router.delete('/:id/students/:userId', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    await prisma.classEnrollment.deleteMany({
      where: { classId: id, userId }
    });

    res.json({ message: 'Student removed from class' });
  } catch (err) {
    console.error('Remove student error:', err);
    res.status(500).json({ error: 'Failed to remove student' });
  }
});

// Upload students via CSV to a class
router.post('/:id/upload-students', authenticateToken, requireTeacherOrAdmin, upload.single('file'), async (req, res) => {
  const classId = parseInt(req.params.id);

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Check ownership if teacher
    const where = { id: classId };
    if (req.user.role !== 'admin') {
      where.teacherId = req.user.id;
    }

    const classData = await prisma.class.findFirst({ where });
    if (!classData) {
      return res.status(404).json({ error: 'Class not found or not authorized' });
    }

    const results = [];
    const errors = [];
    const credentials = [];

    // Preprocess CSV
    let csvContent = req.file.buffer.toString('utf8');
    csvContent = csvContent.split('\n').map(line => {
      line = line.trim();
      if (line.startsWith('#')) line = line.substring(1);
      if (line.endsWith('#')) line = line.slice(0, -1);
      return line;
    }).join('\n');

    const getField = (record, ...names) => {
      for (const name of names) {
        if (record[name] !== undefined) return record[name];
        const lowerName = name.toLowerCase();
        for (const key of Object.keys(record)) {
          if (key.toLowerCase() === lowerName) return record[key];
        }
      }
      return undefined;
    };

    const records = await new Promise((resolve, reject) => {
      parse(csvContent, { columns: true, skip_empty_lines: true, trim: true }, (err, records) => {
        if (err) reject(err);
        else resolve(records);
      });
    });

    if (records.length === 0) {
      return res.json({ created: 0, enrolled: 0, errors: [], credentials: [] });
    }

    // Collect unique group names
    const uniqueGroupNames = new Set();
    records.forEach(record => {
      const group_name = getField(record, 'group_name', 'group', 'Group', 'team', 'Team', 'Project', 'project', 'Project Groups', 'Project Group');
      if (group_name && group_name.trim()) {
        uniqueGroupNames.add(group_name.trim());
      }
    });

    // Create groups map
    const groupMap = new Map();
    for (const groupName of uniqueGroupNames) {
      let group = await prisma.group.findFirst({
        where: { name: groupName, classId }
      });
      if (!group) {
        group = await prisma.group.create({
          data: { name: groupName, classId }
        });
      }
      groupMap.set(groupName, group.id);
    }

    // Process students
    for (const record of records) {
      const university_id = getField(record, 'university_id', 'universityID', 'universityid', 'id', 'ID', 'student_id', 'OrgDefinedId', 'Org Defined Id');
      const last_name = getField(record, 'last_name', 'lastname', 'Last', 'last', 'surname', 'family_name', 'Last Name');
      const first_name = getField(record, 'first_name', 'firstname', 'First', 'first', 'given_name', 'First Name');
      const email = getField(record, 'email', 'Email', 'e-mail', 'EMAIL');
      const group_name = getField(record, 'group_name', 'group', 'Group', 'team', 'Team', 'Project', 'project', 'Project Groups', 'Project Group');

      if (!email || !first_name || !last_name) {
        errors.push({ email: email || 'unknown', error: 'Missing required fields (email, first_name, last_name)' });
        continue;
      }

      try {
        let user = await prisma.user.findUnique({ where: { email } });
        let isNew = false;

        if (!user) {
          // Create new user
          let generatedPassword;
          if (university_id) {
            generatedPassword = university_id;
          } else {
            const username = email.split('@')[0];
            generatedPassword = `${username}Pass123`;
          }
          const hashedPassword = bcrypt.hashSync(generatedPassword, 10);

          user = await prisma.user.create({
            data: {
              email,
              password: hashedPassword,
              firstName: first_name,
              lastName: last_name,
              universityId: university_id || null,
              role: 'student',
              mustChangePassword: 1
            }
          });
          isNew = true;
          credentials.push({ email, password: generatedPassword });
        }

        // Enroll in class
        await prisma.classEnrollment.upsert({
          where: { classId_userId: { classId, userId: user.id } },
          update: {},
          create: { classId, userId: user.id }
        });

        results.push({ id: user.id, email, first_name, last_name, existing: !isNew });

        // Add to group if specified
        if (group_name && group_name.trim()) {
          const groupId = groupMap.get(group_name.trim());
          if (groupId) {
            // Remove from any existing groups in this class first
            await prisma.groupMember.deleteMany({
              where: {
                userId: user.id,
                group: { classId }
              }
            });

            // Add to new group
            await prisma.groupMember.upsert({
              where: { groupId_userId: { groupId, userId: user.id } },
              update: {},
              create: { groupId, userId: user.id }
            });
          }
        }
      } catch (err) {
        if (err.code === 'P2002') {
          errors.push({ email, error: 'Email already exists' });
        } else {
          errors.push({ email, error: err.message });
        }
      }
    }

    // Send emails if requested
    const sendEmails = req.body?.send_emails !== 'false' && req.body?.send_emails !== false;
    let emailsSent = 0;
    if (sendEmails && results.length > 0) {
      // Welcome emails for new users (with credentials)
      for (const cred of credentials) {
        try {
          await emailService.sendWelcomeEmail({
            user: { firstName: results.find(r => r.email === cred.email)?.first_name || '', email: cred.email, role: 'student' },
            temporaryPassword: cred.password
          });
          emailsSent++;
        } catch (emailErr) {
          console.error(`Failed to send welcome email to ${cred.email}:`, emailErr.message);
        }
      }
      // Enrollment notifications for existing users
      const existingUsers = results.filter(r => r.existing);
      for (const user of existingUsers) {
        try {
          await emailService.sendClassEnrollmentEmail({
            user: { firstName: user.first_name, email: user.email },
            className: classData.name
          });
          emailsSent++;
        } catch (emailErr) {
          console.error(`Failed to send enrollment email to ${user.email}:`, emailErr.message);
        }
      }
    }

    res.json({
      created: results.filter(r => !r.existing).length,
      enrolled: results.length,
      errors,
      credentials,
      emails_sent: emailsSent
    });
  } catch (err) {
    console.error('CSV upload error:', err);
    res.status(400).json({ error: 'Failed to parse CSV: ' + err.message });
  }
});

// Get groups in a class with members
router.get('/:id/groups', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const groups = await prisma.group.findMany({
      where: { classId: id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true, role: true }
            }
          },
          orderBy: [
            { user: { lastName: 'asc' } },
            { user: { firstName: 'asc' } }
          ]
        },
        _count: { select: { members: true } }
      },
      orderBy: { name: 'asc' }
    });

    res.json(groups.map(g => ({
      id: g.id,
      name: g.name,
      class_id: g.classId,
      created_at: g.createdAt,
      member_count: g._count.members,
      members: g.members.map(m => ({
        id: m.user.id,
        email: m.user.email,
        first_name: m.user.firstName,
        last_name: m.user.lastName,
        role: m.user.role
      }))
    })));
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get classes for a student (or teacher/admin viewing student dashboard)
router.get('/my/enrolled', authenticateToken, async (req, res) => {
  try {
    const isTeacherOrAdmin = req.user.role === 'teacher' || req.user.role === 'admin';

    let classes;
    if (isTeacherOrAdmin) {
      classes = await prisma.class.findMany({
        where: {
          OR: [
            { teacherId: req.user.id },
            { enrollments: { some: { userId: req.user.id } } }
          ]
        },
        include: {
          teacher: { select: { firstName: true, lastName: true } },
          instructors: {
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }
          },
          phaseDueDates: true
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      classes = await prisma.class.findMany({
        where: {
          enrollments: { some: { userId: req.user.id } }
        },
        include: {
          teacher: { select: { firstName: true, lastName: true } },
          instructors: {
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }
          },
          phaseDueDates: true
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    res.json(classes.map(formatClassResponse));
  } catch (err) {
    console.error('Get enrolled classes error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Reset student password (teacher can reset for students in their class)
router.post('/:id/students/:userId/reset-password', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    const { password } = req.body;

    // Check ownership
    const where = { id: classId };
    if (req.user.role !== 'admin') {
      where.teacherId = req.user.id;
    }

    const classData = await prisma.class.findFirst({ where });
    if (!classData) {
      return res.status(404).json({ error: 'Class not found or not authorized' });
    }

    // Check if student is enrolled
    const enrollment = await prisma.classEnrollment.findUnique({
      where: { classId_userId: { classId, userId } }
    });
    if (!enrollment) {
      return res.status(404).json({ error: 'Student not enrolled in this class' });
    }

    // Get user info for email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true }
    });

    // Generate temp password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let tempPassword = '';
    for (let i = 0; i < 12; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const hashedPassword = bcrypt.hashSync(tempPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword, mustChangePassword: 1 }
    });

    // Send password reset email
    try {
      await emailService.sendPasswordReset({
        user: {
          firstName: user.firstName,
          email: user.email
        },
        temporaryPassword: tempPassword
      });
    } catch (emailErr) {
      console.error('Failed to send password reset email:', emailErr);
    }

    res.json({ message: 'Password reset email sent. Student must change password on next login.' });
  } catch (err) {
    console.error('Reset student password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Send invite/enrollment email to a student in a class
router.post('/:id/students/:userId/send-invite', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    // Check ownership
    const where = { id: classId };
    if (req.user.role !== 'admin') {
      where.teacherId = req.user.id;
    }

    const classData = await prisma.class.findFirst({ where });
    if (!classData) {
      return res.status(404).json({ error: 'Class not found or not authorized' });
    }

    // Check if student is enrolled
    const enrollment = await prisma.classEnrollment.findUnique({
      where: { classId_userId: { classId, userId } }
    });
    if (!enrollment) {
      return res.status(404).json({ error: 'Student not enrolled in this class' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true }
    });

    await emailService.sendClassEnrollmentEmail({
      user: { firstName: user.firstName, email: user.email },
      className: classData.name
    });

    res.json({ message: `Enrollment email sent to ${user.email}` });
  } catch (err) {
    console.error('Send invite error:', err);
    res.status(500).json({ error: 'Failed to send invite email' });
  }
});

// Bulk send invite/enrollment emails to all students in a class
router.post('/:id/students/send-invites', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id);

    // Check ownership
    const where = { id: classId };
    if (req.user.role !== 'admin') {
      where.teacherId = req.user.id;
    }

    const classData = await prisma.class.findFirst({ where });
    if (!classData) {
      return res.status(404).json({ error: 'Class not found or not authorized' });
    }

    // Get all enrolled students
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, role: true }
        }
      }
    });

    const students = enrollments
      .filter(e => e.user.role === 'student')
      .map(e => e.user);

    let sent = 0;
    let failed = 0;

    for (const student of students) {
      try {
        await emailService.sendClassEnrollmentEmail({
          user: { firstName: student.firstName, email: student.email },
          className: classData.name
        });
        sent++;
        // Small delay to avoid rate limiting
        if (sent % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.error(`Failed to send invite to ${student.email}:`, err);
        failed++;
      }
    }

    res.json({ message: `Sent ${sent} invite email${sent !== 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}`, sent, failed });
  } catch (err) {
    console.error('Bulk send invite error:', err);
    res.status(500).json({ error: 'Failed to send invite emails' });
  }
});

// Get all extensions for a class
router.get('/:id/extensions', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const extensions = await prisma.studentExtension.findMany({
      where: { classId: id },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } }
      },
      orderBy: [
        { user: { lastName: 'asc' } },
        { user: { firstName: 'asc' } },
        { phase: 'asc' }
      ]
    });

    res.json(extensions.map(e => ({
      id: e.id,
      class_id: e.classId,
      user_id: e.userId,
      phase: e.phase,
      extended_due_date: e.extendedDueDate,
      created_at: e.createdAt,
      first_name: e.user.firstName,
      last_name: e.user.lastName,
      email: e.user.email
    })));
  } catch (err) {
    console.error('Get extensions error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create or update an extension
router.post('/:id/extensions', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const { user_id, phase, extended_due_date } = req.body;

    if (!user_id || phase === undefined || !extended_due_date) {
      return res.status(400).json({ error: 'Missing required fields: user_id, phase, extended_due_date' });
    }

    const extension = await prisma.studentExtension.upsert({
      where: {
        classId_userId_phase: { classId, userId: user_id, phase }
      },
      update: { extendedDueDate: extended_due_date },
      create: { classId, userId: user_id, phase, extendedDueDate: extended_due_date }
    });

    res.json({ message: 'Extension saved', id: extension.id });
  } catch (err) {
    console.error('Create extension error:', err);
    res.status(500).json({ error: 'Failed to save extension' });
  }
});

// Delete an extension
router.delete('/:id/extensions/:userId/:phase', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    const phase = parseInt(req.params.phase);

    await prisma.studentExtension.deleteMany({
      where: { classId, userId, phase }
    });

    res.json({ message: 'Extension deleted' });
  } catch (err) {
    console.error('Delete extension error:', err);
    res.status(500).json({ error: 'Failed to delete extension' });
  }
});

// Bulk update extensions
router.put('/:id/extensions', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const { extensions } = req.body;

    if (!Array.isArray(extensions)) {
      return res.status(400).json({ error: 'extensions must be an array' });
    }

    // Delete all existing extensions for this class
    await prisma.studentExtension.deleteMany({ where: { classId } });

    // Filter and create valid extensions
    const validExtensions = extensions.filter(e => e.extended_due_date);

    if (validExtensions.length > 0) {
      await prisma.studentExtension.createMany({
        data: validExtensions.map(ext => ({
          classId,
          userId: ext.user_id,
          phase: ext.phase,
          extendedDueDate: ext.extended_due_date
        }))
      });
    }

    res.json({ message: 'Extensions updated', count: validExtensions.length });
  } catch (err) {
    console.error('Bulk update extensions error:', err);
    res.status(500).json({ error: 'Failed to save some extensions' });
  }
});

// Copy/clone a class with new semester and dates
router.post('/:id/copy', authenticateToken, requireTeacherOrAdmin, async (req, res) => {
  try {
    const sourceId = parseInt(req.params.id);
    const { name, section, semester, phase_due_dates } = req.body;

    // Check ownership of source class
    const where = { id: sourceId };
    if (req.user.role !== 'admin') {
      where.teacherId = req.user.id;
    }

    const sourceClass = await prisma.class.findFirst({
      where,
      include: {
        instructors: true,
        criteria: { orderBy: { orderIndex: 'asc' } },
        assignments: {
          include: {
            evalTypes: {
              include: {
                criteria: { orderBy: { orderIndex: 'asc' } }
              }
            }
          },
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    if (!sourceClass) {
      return res.status(404).json({ error: 'Class not found or access denied' });
    }

    // Create the new class with same settings
    const newClass = await prisma.class.create({
      data: {
        name: name || `${sourceClass.name} (Copy)`,
        section: section !== undefined ? section : sourceClass.section,
        semester: semester !== undefined ? semester : sourceClass.semester,
        teacherId: req.user.id,
        numPhases: sourceClass.numPhases,
        hasFinalEvaluation: sourceClass.hasFinalEvaluation,
        dueDateTimezone: sourceClass.dueDateTimezone,
        minCommentWords: sourceClass.minCommentWords,
        evaluationMode: sourceClass.evaluationMode,
        allowLate: sourceClass.allowLate,
        lateWindowHours: sourceClass.lateWindowHours,
        includeSelfEval: sourceClass.includeSelfEval,
        peerTemplateId: sourceClass.peerTemplateId,
        audienceTemplateId: sourceClass.audienceTemplateId,
        selfTemplateId: sourceClass.selfTemplateId,
        paperReviewTemplateId: sourceClass.paperReviewTemplateId
      }
    });

    // Copy instructors (add current user if not already included)
    const instructorIds = new Set(sourceClass.instructors.map(i => i.userId));
    instructorIds.add(req.user.id);

    for (const instructorId of instructorIds) {
      await prisma.classInstructor.create({
        data: { classId: newClass.id, userId: instructorId }
      });
    }

    // Copy phase due dates if provided, otherwise leave empty for user to set
    if (phase_due_dates && typeof phase_due_dates === 'object') {
      const phases = Object.keys(phase_due_dates).filter(p => phase_due_dates[p]);
      if (phases.length > 0) {
        await prisma.phaseDueDate.createMany({
          data: phases.map(phase => ({
            classId: newClass.id,
            phase: parseInt(phase),
            dueDate: phase_due_dates[phase]
          }))
        });
      }
    }

    // Copy class criteria (for phase-mode classes)
    if (sourceClass.criteria && sourceClass.criteria.length > 0) {
      for (const criterion of sourceClass.criteria) {
        await prisma.classEvalCriterion.create({
          data: {
            classId: newClass.id,
            name: criterion.name,
            description: criterion.description,
            orderIndex: criterion.orderIndex,
            minValue: criterion.minValue,
            maxValue: criterion.maxValue,
            questionType: criterion.questionType || 'likert'
          }
        });
      }
    }

    // Copy assignments (for assignment-mode classes)
    if (sourceClass.assignments && sourceClass.assignments.length > 0) {
      for (const assignment of sourceClass.assignments) {
        const newAssignment = await prisma.assignment.create({
          data: {
            classId: newClass.id,
            name: assignment.name,
            description: assignment.description,
            orderIndex: assignment.orderIndex,
            dueDate: null // Clear due dates - user should set new ones
          }
        });

        // Copy eval types for this assignment
        if (assignment.evalTypes && assignment.evalTypes.length > 0) {
          for (const evalType of assignment.evalTypes) {
            const newEvalType = await prisma.assignmentEvalType.create({
              data: {
                assignmentId: newAssignment.id,
                evalType: evalType.evalType,
                name: evalType.name,
                targetType: evalType.targetType,
                weight: evalType.weight,
                includeSelf: evalType.includeSelf,
                isRequired: evalType.isRequired,
                minCompletion: evalType.minCompletion,
                requireComments: evalType.requireComments,
                minCommentWords: evalType.minCommentWords,
                allowLate: evalType.allowLate,
                dueDate: null // Clear due dates
              }
            });

            // Copy criteria for this eval type
            if (evalType.criteria && evalType.criteria.length > 0) {
              for (const criterion of evalType.criteria) {
                await prisma.evalTypeCriterion.create({
                  data: {
                    evalTypeId: newEvalType.id,
                    name: criterion.name,
                    description: criterion.description,
                    orderIndex: criterion.orderIndex,
                    minValue: criterion.minValue,
                    maxValue: criterion.maxValue,
                    questionType: criterion.questionType || 'likert'
                  }
                });
              }
            }
          }
        }
      }
    }

    // Fetch the new class with all relations
    const createdClass = await prisma.class.findUnique({
      where: { id: newClass.id },
      include: {
        teacher: { select: { firstName: true, lastName: true, email: true } },
        instructors: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }
        },
        phaseDueDates: true,
        _count: { select: { enrollments: true, groups: true } }
      }
    });

    res.json(formatClassResponse(createdClass));
  } catch (err) {
    console.error('Copy class error:', err);
    res.status(500).json({ error: 'Failed to copy class' });
  }
});

module.exports = router;
