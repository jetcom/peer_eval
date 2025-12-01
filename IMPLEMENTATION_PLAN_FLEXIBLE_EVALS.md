# Implementation Plan: Flexible Evaluation System

## Overview

This plan adds support for **assignment-based evaluations** (presentations, papers) alongside the existing **phase-based evaluations** (group project checkpoints). It also enhances the phase-based system with customizable criteria.

### Key Features
- **Prisma ORM** - Type-safe database access, works with SQLite (dev) and Postgres (prod)
- **Class Creation Wizard** - Guided setup for different class types
- **Assignment Mode** - Evaluate specific deliverables (presentations, papers)
- **Audience Evaluations** - Students rate other groups' presentations
- **Customizable Criteria** - Configurable Likert scales and rubrics
- **Minimum Completion Thresholds** - Flexible requirements for audience evals
- **Enhanced Reports** - Wide CSV, Long CSV, and PDF exports
- **Self-Evaluation** - Optional, configurable per evaluation type

---

## Phase 0: Migrate to Prisma ORM

Before adding new features, migrate from raw SQL (`better-sqlite3`) to Prisma. This provides:
- **Type safety** - Auto-generated TypeScript types
- **Database agnostic** - Same code works with SQLite (dev) and Postgres (prod)
- **Easier relations** - No more manual JOINs for nested data
- **Proper migrations** - Version-controlled schema changes

### 0.1 Install Prisma

```bash
cd backend
npm install prisma @prisma/client
npx prisma init --datasource-provider sqlite
```

### 0.2 Introspect Existing Database

```bash
# Generate schema from existing database
npx prisma db pull
```

This creates `prisma/schema.prisma` based on your current tables.

### 0.3 Initial Prisma Schema (Existing Tables)

After introspection, clean up and add relations:

```prisma
// prisma/schema.prisma

datasource db {
  provider = "sqlite"  // Change to "postgresql" for production
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ==================
// EXISTING TABLES
// ==================

model User {
  id                  Int       @id @default(autoincrement())
  email               String    @unique
  password            String
  role                String    @default("student")
  firstName           String    @map("first_name")
  lastName            String    @map("last_name")
  mustChangePassword  Boolean   @default(false) @map("must_change_password")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")

  // Relations
  enrollments         ClassEnrollment[]
  groupMemberships    GroupMember[]
  instructorOf        ClassInstructor[]
  evaluationsGiven    Evaluation[]       @relation("EvaluatorRelation")
  evaluationsReceived Evaluation[]       @relation("EvaluateeRelation")
  finalCommentsGiven  FinalComment[]     @relation("FinalCommentEvaluator")
  finalCommentsReceived FinalComment[]   @relation("FinalCommentEvaluatee")
  extensions          StudentExtension[]
  createdTemplates    EvalTemplate[]

  @@map("users")
}

model Class {
  id                  Int       @id @default(autoincrement())
  name                String
  section             String?
  semester            String?
  numPhases           Int       @default(3) @map("num_phases")
  hasFinalEvaluation  Boolean   @default(true) @map("has_final_evaluation")
  dueDateTimezone     String    @default("America/New_York") @map("due_date_timezone")
  minCommentWords     Int?      @map("min_comment_words")
  evaluationMode      String    @default("phases") @map("evaluation_mode")
  allowLate           Boolean   @default(true) @map("allow_late")
  includeSelfEval     Boolean   @default(false) @map("include_self_eval")
  isArchived          Boolean   @default(false) @map("is_archived")
  teacherId           Int?      @map("teacher_id")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")

  // Relations
  enrollments         ClassEnrollment[]
  groups              Group[]
  instructors         ClassInstructor[]
  evaluations         Evaluation[]
  finalComments       FinalComment[]
  phaseDueDates       PhaseDueDate[]
  extensions          StudentExtension[]
  criteria            ClassEvalCriterion[]
  assignments         Assignment[]

  @@map("classes")
}

model ClassEnrollment {
  id        Int      @id @default(autoincrement())
  classId   Int      @map("class_id")
  userId    Int      @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")

  class     Class    @relation(fields: [classId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([classId, userId])
  @@map("class_enrollments")
}

model Group {
  id        Int      @id @default(autoincrement())
  classId   Int      @map("class_id")
  name      String
  createdAt DateTime @default(now()) @map("created_at")

  class     Class         @relation(fields: [classId], references: [id], onDelete: Cascade)
  members   GroupMember[]
  groupEvaluations GroupEvaluation[]

  @@map("groups")
}

model GroupMember {
  id        Int      @id @default(autoincrement())
  groupId   Int      @map("group_id")
  userId    Int      @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")

  group     Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([groupId, userId])
  @@map("group_members")
}

model ClassInstructor {
  id        Int      @id @default(autoincrement())
  classId   Int      @map("class_id")
  userId    Int      @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")

  class     Class    @relation(fields: [classId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([classId, userId])
  @@map("class_instructors")
}

model Evaluation {
  id            Int      @id @default(autoincrement())
  evaluatorId   Int      @map("evaluator_id")
  evaluateeId   Int      @map("evaluatee_id")
  classId       Int      @map("class_id")
  phase         Int

  // Legacy fixed criteria (for backward compatibility)
  contribution  Int?
  communication Int?
  reliability   Int?
  qualityOfWork Int?     @map("quality_of_work")
  collaboration Int?

  score         Int?
  comments      String?
  submittedAt   DateTime? @map("submitted_at")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  evaluator     User     @relation("EvaluatorRelation", fields: [evaluatorId], references: [id])
  evaluatee     User     @relation("EvaluateeRelation", fields: [evaluateeId], references: [id])
  class         Class    @relation(fields: [classId], references: [id], onDelete: Cascade)
  criterionScores EvaluationCriterionScore[]

  @@unique([evaluatorId, evaluateeId, phase, classId])
  @@map("evaluations")
}

model FinalComment {
  id          Int      @id @default(autoincrement())
  evaluatorId Int      @map("evaluator_id")
  evaluateeId Int      @map("evaluatee_id")
  classId     Int      @map("class_id")
  comments    String?
  finalPoints Int?     @map("final_points")
  submittedAt DateTime? @map("submitted_at")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  evaluator   User     @relation("FinalCommentEvaluator", fields: [evaluatorId], references: [id])
  evaluatee   User     @relation("FinalCommentEvaluatee", fields: [evaluateeId], references: [id])
  class       Class    @relation(fields: [classId], references: [id], onDelete: Cascade)

  @@unique([evaluatorId, evaluateeId, classId])
  @@map("final_comments")
}

model PhaseDueDate {
  id      Int      @id @default(autoincrement())
  classId Int      @map("class_id")
  phase   Int
  dueDate String   @map("due_date")

  class   Class    @relation(fields: [classId], references: [id], onDelete: Cascade)

  @@unique([classId, phase])
  @@map("phase_due_dates")
}

model StudentExtension {
  id              Int      @id @default(autoincrement())
  classId         Int      @map("class_id")
  userId          Int      @map("user_id")
  phase           Int
  extendedDueDate String   @map("extended_due_date")
  createdAt       DateTime @default(now()) @map("created_at")

  class           Class    @relation(fields: [classId], references: [id], onDelete: Cascade)
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([classId, userId, phase])
  @@map("student_extensions")
}

// ==================
// NEW TABLES
// ==================

// Templates for reusable rubrics
model EvalTemplate {
  id          Int       @id @default(autoincrement())
  name        String
  description String?
  targetType  String    @map("target_type")  // 'individual' or 'group'
  isSystem    Boolean   @default(false) @map("is_system")
  createdById Int?      @map("created_by")
  createdAt   DateTime  @default(now()) @map("created_at")

  createdBy   User?     @relation(fields: [createdById], references: [id])
  criteria    EvalTemplateCriterion[]

  @@map("eval_templates")
}

model EvalTemplateCriterion {
  id          Int      @id @default(autoincrement())
  templateId  Int      @map("template_id")
  name        String
  description String?
  orderIndex  Int      @default(0) @map("order_index")
  minValue    Int      @default(1) @map("min_value")
  maxValue    Int      @default(5) @map("max_value")

  template    EvalTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@map("eval_template_criteria")
}

// Custom criteria for phase-based classes
model ClassEvalCriterion {
  id          Int      @id @default(autoincrement())
  classId     Int      @map("class_id")
  name        String
  description String?
  orderIndex  Int      @default(0) @map("order_index")
  minValue    Int      @default(1) @map("min_value")
  maxValue    Int      @default(5) @map("max_value")

  class       Class    @relation(fields: [classId], references: [id], onDelete: Cascade)
  scores      EvaluationCriterionScore[]

  @@map("class_eval_criteria")
}

model EvaluationCriterionScore {
  id           Int      @id @default(autoincrement())
  evaluationId Int      @map("evaluation_id")
  criterionId  Int      @map("criterion_id")
  score        Int

  evaluation   Evaluation         @relation(fields: [evaluationId], references: [id], onDelete: Cascade)
  criterion    ClassEvalCriterion @relation(fields: [criterionId], references: [id], onDelete: Cascade)

  @@unique([evaluationId, criterionId])
  @@map("evaluation_criterion_scores")
}

// Assignment mode tables
model Assignment {
  id          Int      @id @default(autoincrement())
  classId     Int      @map("class_id")
  name        String
  description String?
  orderIndex  Int      @default(0) @map("order_index")
  dueDate     String?  @map("due_date")
  createdAt   DateTime @default(now()) @map("created_at")

  class       Class    @relation(fields: [classId], references: [id], onDelete: Cascade)
  evalTypes   AssignmentEvalType[]

  @@map("assignments")
}

model AssignmentEvalType {
  id              Int      @id @default(autoincrement())
  assignmentId    Int      @map("assignment_id")
  evalType        String   @map("eval_type")  // 'peer', 'audience', 'self', 'paper_review'
  name            String
  targetType      String   @map("target_type")  // 'individual' or 'group'
  weight          Float    @default(1.0)
  includeSelf     Boolean  @default(false) @map("include_self")
  isRequired      Boolean  @default(true) @map("is_required")
  minCompletion   Int?     @map("min_completion")
  requireComments Boolean  @default(false) @map("require_comments")
  minCommentWords Int?     @map("min_comment_words")
  allowLate       Boolean  @default(true) @map("allow_late")
  dueDate         String?  @map("due_date")

  assignment      Assignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  criteria        EvalTypeCriterion[]
  evaluations     AssignmentEvaluation[]
  groupEvaluations GroupEvaluation[]
  extensions      AssignmentExtension[]

  @@unique([assignmentId, evalType])
  @@map("assignment_eval_types")
}

model EvalTypeCriterion {
  id          Int      @id @default(autoincrement())
  evalTypeId  Int      @map("eval_type_id")
  name        String
  description String?
  orderIndex  Int      @default(0) @map("order_index")
  minValue    Int      @default(1) @map("min_value")
  maxValue    Int      @default(5) @map("max_value")

  evalType    AssignmentEvalType @relation(fields: [evalTypeId], references: [id], onDelete: Cascade)
  scores      AssignmentEvaluationScore[]
  groupScores GroupEvaluationScore[]

  @@map("eval_type_criteria")
}

model AssignmentEvaluation {
  id          Int       @id @default(autoincrement())
  evaluatorId Int       @map("evaluator_id")
  evaluateeId Int       @map("evaluatee_id")
  evalTypeId  Int       @map("eval_type_id")
  comments    String?
  submittedAt DateTime? @map("submitted_at")
  isLate      Boolean   @default(false) @map("is_late")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  evalType    AssignmentEvalType @relation(fields: [evalTypeId], references: [id], onDelete: Cascade)
  scores      AssignmentEvaluationScore[]

  @@unique([evaluatorId, evaluateeId, evalTypeId])
  @@map("assignment_evaluations")
}

model AssignmentEvaluationScore {
  id           Int      @id @default(autoincrement())
  evaluationId Int      @map("evaluation_id")
  criterionId  Int      @map("criterion_id")
  score        Int

  evaluation   AssignmentEvaluation @relation(fields: [evaluationId], references: [id], onDelete: Cascade)
  criterion    EvalTypeCriterion    @relation(fields: [criterionId], references: [id], onDelete: Cascade)

  @@unique([evaluationId, criterionId])
  @@map("assignment_evaluation_scores")
}

model GroupEvaluation {
  id          Int       @id @default(autoincrement())
  evaluatorId Int       @map("evaluator_id")
  groupId     Int       @map("group_id")
  evalTypeId  Int       @map("eval_type_id")
  comments    String?
  submittedAt DateTime? @map("submitted_at")
  isLate      Boolean   @default(false) @map("is_late")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  group       Group              @relation(fields: [groupId], references: [id], onDelete: Cascade)
  evalType    AssignmentEvalType @relation(fields: [evalTypeId], references: [id], onDelete: Cascade)
  scores      GroupEvaluationScore[]

  @@unique([evaluatorId, groupId, evalTypeId])
  @@map("group_evaluations")
}

model GroupEvaluationScore {
  id                Int      @id @default(autoincrement())
  groupEvaluationId Int      @map("group_evaluation_id")
  criterionId       Int      @map("criterion_id")
  score             Int

  groupEvaluation   GroupEvaluation   @relation(fields: [groupEvaluationId], references: [id], onDelete: Cascade)
  criterion         EvalTypeCriterion @relation(fields: [criterionId], references: [id], onDelete: Cascade)

  @@unique([groupEvaluationId, criterionId])
  @@map("group_evaluation_scores")
}

model AssignmentExtension {
  id              Int      @id @default(autoincrement())
  userId          Int      @map("user_id")
  evalTypeId      Int      @map("eval_type_id")
  extendedDueDate String   @map("extended_due_date")
  createdAt       DateTime @default(now()) @map("created_at")

  evalType        AssignmentEvalType @relation(fields: [evalTypeId], references: [id], onDelete: Cascade)

  @@unique([userId, evalTypeId])
  @@map("assignment_extensions")
}
```

### 0.4 Environment Configuration

Create/update `.env` files:

```bash
# .env.development (SQLite for local dev)
DATABASE_URL="file:./peereval.db"

# .env.production (Postgres)
DATABASE_URL="postgresql://user:password@host:5432/peereval?schema=public"
```

### 0.5 Baseline Migration

```bash
# Create initial migration from current state
npx prisma migrate dev --name init

# Generate Prisma Client
npx prisma generate
```

### 0.6 Create Prisma Client Singleton

```javascript
// backend/lib/prisma.js
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
```

### 0.7 Seed Default Templates

```javascript
// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Peer Evaluation Template
  await prisma.evalTemplate.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Peer Evaluation (Teammate)',
      description: 'Standard teammate evaluation rubric',
      targetType: 'individual',
      isSystem: true,
      criteria: {
        create: [
          { name: 'Contribution', description: 'Contributed fair share to the team\'s work', orderIndex: 1 },
          { name: 'Communication', description: 'Communicated clearly and kept team informed', orderIndex: 2 },
          { name: 'Reliability', description: 'Met deadlines and followed through on commitments', orderIndex: 3 },
          { name: 'Quality of Work', description: 'Produced high-quality work', orderIndex: 4 },
          { name: 'Collaboration', description: 'Worked well with others, receptive to feedback', orderIndex: 5 },
        ]
      }
    }
  });

  // Presentation Rubric Template
  await prisma.evalTemplate.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      name: 'Presentation Rubric',
      description: 'Evaluate group presentations',
      targetType: 'group',
      isSystem: true,
      criteria: {
        create: [
          { name: 'Clarity', description: 'Information was presented clearly and logically', orderIndex: 1 },
          { name: 'Research Depth', description: 'Topic was thoroughly researched with credible sources', orderIndex: 2 },
          { name: 'Engagement', description: 'Presenters engaged the audience effectively', orderIndex: 3 },
          { name: 'Visual Design', description: 'Slides/visuals were professional and supported the content', orderIndex: 4 },
          { name: 'Q&A Handling', description: 'Questions were answered thoughtfully and accurately', orderIndex: 5 },
        ]
      }
    }
  });

  // Paper Review Template
  await prisma.evalTemplate.upsert({
    where: { id: 3 },
    update: {},
    create: {
      id: 3,
      name: 'Paper Review',
      description: 'Evaluate written work',
      targetType: 'individual',
      isSystem: true,
      criteria: {
        create: [
          { name: 'Thesis/Argument', description: 'Clear, well-articulated central argument', orderIndex: 1 },
          { name: 'Evidence', description: 'Strong supporting evidence from credible sources', orderIndex: 2 },
          { name: 'Analysis', description: 'Thoughtful analysis and critical thinking', orderIndex: 3 },
          { name: 'Organization', description: 'Logical structure and flow', orderIndex: 4 },
          { name: 'Writing Quality', description: 'Clear prose, proper grammar and citations', orderIndex: 5 },
        ]
      }
    }
  });

  // Self-Evaluation Template
  await prisma.evalTemplate.upsert({
    where: { id: 4 },
    update: {},
    create: {
      id: 4,
      name: 'Self-Evaluation',
      description: 'Student self-assessment',
      targetType: 'individual',
      isSystem: true,
      criteria: {
        create: [
          { name: 'Contribution', description: 'How much did you contribute to the team?', orderIndex: 1 },
          { name: 'Effort', description: 'How much effort did you put into this assignment?', orderIndex: 2 },
          { name: 'Learning', description: 'How much did you learn from this experience?', orderIndex: 3 },
        ]
      }
    }
  });

  console.log('Seed data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Update `package.json`:
```json
{
  "prisma": {
    "seed": "node prisma/seed.js"
  }
}
```

### 0.8 Gradual Route Migration

Migrate routes one at a time. Example for evaluations:

**Before (raw SQL):**
```javascript
// backend/routes/evaluations.js
const db = require('../database');

router.get('/', auth, (req, res) => {
  const evaluations = db.prepare(`
    SELECT e.*, u.first_name, u.last_name
    FROM evaluations e
    JOIN users u ON e.evaluatee_id = u.id
    WHERE e.evaluator_id = ? AND e.class_id = ?
  `).all(req.user.id, req.query.class_id);

  res.json(evaluations);
});
```

**After (Prisma):**
```javascript
// backend/routes/evaluations.js
const prisma = require('../lib/prisma');

router.get('/', auth, async (req, res) => {
  const evaluations = await prisma.evaluation.findMany({
    where: {
      evaluatorId: req.user.id,
      classId: parseInt(req.query.class_id)
    },
    include: {
      evaluatee: {
        select: { firstName: true, lastName: true }
      }
    }
  });

  res.json(evaluations);
});
```

### 0.9 Migration Order

Migrate routes in this order (least to most complex):

1. `routes/templates.js` (new, start fresh with Prisma)
2. `routes/users.js` (simple CRUD)
3. `routes/classes.js` (medium complexity)
4. `routes/groups.js` (medium complexity)
5. `routes/evaluations.js` (most complex, do last)

### 0.10 Remove Legacy Database Code

Once all routes are migrated:

1. Remove `backend/database.js`
2. Remove `better-sqlite3` from `package.json`
3. Update any remaining raw SQL references

### 0.11 Files to Create/Modify

**New Files:**
- `backend/prisma/schema.prisma` - Schema definition
- `backend/prisma/seed.js` - Seed default templates
- `backend/lib/prisma.js` - Prisma client singleton
- `backend/.env` - Database URL configuration

**Modified Files:**
- `backend/package.json` - Add prisma dependencies, seed script
- `backend/routes/*.js` - Migrate to Prisma queries
- `backend/server.js` - Remove old database initialization

### 0.12 Testing the Migration

```bash
# Reset and test locally
npx prisma migrate reset  # Drops DB, runs migrations, runs seed

# Verify data
npx prisma studio  # Opens web UI to browse data
```

### 0.13 Production Migration

For the Postgres production database:

```bash
# Generate migration SQL without applying
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > migration.sql

# Review the SQL, then apply to production
# Or use prisma migrate deploy for managed migrations
npx prisma migrate deploy
```

---

## Phase 1: Database Schema & Migrations

### 1.1 Add Evaluation Templates Tables

```sql
-- System-wide reusable rubric templates
CREATE TABLE eval_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  target_type TEXT NOT NULL CHECK(target_type IN ('individual', 'group')),
  is_system BOOLEAN DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE eval_template_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES eval_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  min_value INTEGER DEFAULT 1,
  max_value INTEGER DEFAULT 5
);
```

### 1.2 Seed Default Templates

```sql
-- Template 1: Peer Evaluation (Teammate)
INSERT INTO eval_templates (name, description, target_type, is_system)
VALUES ('Peer Evaluation (Teammate)', 'Standard teammate evaluation rubric', 'individual', TRUE);

INSERT INTO eval_template_criteria (template_id, name, description, order_index) VALUES
(1, 'Contribution', 'Contributed fair share to the team''s work', 1),
(1, 'Communication', 'Communicated clearly and kept team informed', 2),
(1, 'Reliability', 'Met deadlines and followed through on commitments', 3),
(1, 'Quality of Work', 'Produced high-quality work', 4),
(1, 'Collaboration', 'Worked well with others, receptive to feedback', 5);

-- Template 2: Presentation Rubric
INSERT INTO eval_templates (name, description, target_type, is_system)
VALUES ('Presentation Rubric', 'Evaluate group presentations', 'group', TRUE);

INSERT INTO eval_template_criteria (template_id, name, description, order_index) VALUES
(2, 'Clarity', 'Information was presented clearly and logically', 1),
(2, 'Research Depth', 'Topic was thoroughly researched with credible sources', 2),
(2, 'Engagement', 'Presenters engaged the audience effectively', 3),
(2, 'Visual Design', 'Slides/visuals were professional and supported the content', 4),
(2, 'Q&A Handling', 'Questions were answered thoughtfully and accurately', 5);

-- Template 3: Paper/Written Work Review
INSERT INTO eval_templates (name, description, target_type, is_system)
VALUES ('Paper Review', 'Evaluate written work', 'individual', TRUE);

INSERT INTO eval_template_criteria (template_id, name, description, order_index) VALUES
(3, 'Thesis/Argument', 'Clear, well-articulated central argument', 1),
(3, 'Evidence', 'Strong supporting evidence from credible sources', 2),
(3, 'Analysis', 'Thoughtful analysis and critical thinking', 3),
(3, 'Organization', 'Logical structure and flow', 4),
(3, 'Writing Quality', 'Clear prose, proper grammar and citations', 5);

-- Template 4: Self-Evaluation
INSERT INTO eval_templates (name, description, target_type, is_system)
VALUES ('Self-Evaluation', 'Student self-assessment', 'individual', TRUE);

INSERT INTO eval_template_criteria (template_id, name, description, order_index) VALUES
(4, 'Contribution', 'How much did you contribute to the team?', 1),
(4, 'Effort', 'How much effort did you put into this assignment?', 2),
(4, 'Learning', 'How much did you learn from this experience?', 3);
```

### 1.3 Modify Classes Table

```sql
ALTER TABLE classes ADD COLUMN evaluation_mode TEXT DEFAULT 'phases'
  CHECK(evaluation_mode IN ('phases', 'assignments'));
```

### 1.4 Add Phase Mode Custom Criteria Tables

```sql
-- Custom criteria for phase-based classes (replaces hardcoded columns)
CREATE TABLE class_eval_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  min_value INTEGER DEFAULT 1,
  max_value INTEGER DEFAULT 5
);

-- Individual scores per criterion (for phase-based evaluations)
CREATE TABLE evaluation_criterion_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  criterion_id INTEGER NOT NULL REFERENCES class_eval_criteria(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  UNIQUE(evaluation_id, criterion_id)
);
```

### 1.5 Add Assignment Mode Tables

```sql
-- Assignments (deliverables to evaluate)
CREATE TABLE assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  due_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Evaluation types per assignment
CREATE TABLE assignment_eval_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  eval_type TEXT NOT NULL CHECK(eval_type IN ('peer', 'audience', 'self', 'paper_review')),
  name TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('individual', 'group')),
  weight REAL DEFAULT 1.0,
  include_self BOOLEAN DEFAULT FALSE,
  is_required BOOLEAN DEFAULT TRUE,
  min_completion INTEGER,  -- NULL = all required, else minimum count
  require_comments BOOLEAN DEFAULT FALSE,
  min_comment_words INTEGER,
  allow_late BOOLEAN DEFAULT TRUE,
  due_date TEXT,  -- Override assignment due date
  UNIQUE(assignment_id, eval_type)
);

-- Criteria per evaluation type
CREATE TABLE eval_type_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eval_type_id INTEGER NOT NULL REFERENCES assignment_eval_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  min_value INTEGER DEFAULT 1,
  max_value INTEGER DEFAULT 5
);

-- Individual evaluations (peer, self)
CREATE TABLE assignment_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluator_id INTEGER NOT NULL REFERENCES users(id),
  evaluatee_id INTEGER NOT NULL REFERENCES users(id),
  eval_type_id INTEGER NOT NULL REFERENCES assignment_eval_types(id) ON DELETE CASCADE,
  comments TEXT,
  submitted_at TEXT,
  is_late BOOLEAN DEFAULT FALSE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(evaluator_id, evaluatee_id, eval_type_id)
);

-- Scores for individual evaluations
CREATE TABLE assignment_evaluation_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_id INTEGER NOT NULL REFERENCES assignment_evaluations(id) ON DELETE CASCADE,
  criterion_id INTEGER NOT NULL REFERENCES eval_type_criteria(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  UNIQUE(evaluation_id, criterion_id)
);

-- Group evaluations (audience → group)
CREATE TABLE group_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluator_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER NOT NULL REFERENCES groups(id),
  eval_type_id INTEGER NOT NULL REFERENCES assignment_eval_types(id) ON DELETE CASCADE,
  comments TEXT,
  submitted_at TEXT,
  is_late BOOLEAN DEFAULT FALSE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(evaluator_id, group_id, eval_type_id)
);

-- Scores for group evaluations
CREATE TABLE group_evaluation_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_evaluation_id INTEGER NOT NULL REFERENCES group_evaluations(id) ON DELETE CASCADE,
  criterion_id INTEGER NOT NULL REFERENCES eval_type_criteria(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  UNIQUE(group_evaluation_id, criterion_id)
);

-- Extensions for assignment mode
CREATE TABLE assignment_extensions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
  eval_type_id INTEGER REFERENCES assignment_eval_types(id) ON DELETE CASCADE,
  extended_due_date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, assignment_id, eval_type_id)
);
```

### 1.6 Migration Strategy

- All schema changes are additive (no breaking changes)
- Existing classes default to `evaluation_mode = 'phases'`
- Existing evaluations continue using legacy columns (`contribution`, `communication`, etc.)
- New phase-based classes can optionally use `class_eval_criteria` for custom criteria
- No data migration required for existing classes

### Files to Modify
- `backend/database.js` - Add new tables, seed templates
- `backend/migrations/` - Create migration file for schema changes

---

## Phase 2: Class Creation Wizard

### 2.1 New Components

Create wizard flow components:

```
frontend/src/components/admin/ClassWizard/
├── ClassWizard.js           # Main wizard container
├── WizardStep.js            # Reusable step wrapper
├── steps/
│   ├── ClassTypeStep.js     # Step 1: Choose phases vs assignments
│   ├── BasicInfoStep.js     # Step 2: Name, section, semester
│   ├── PhaseConfigStep.js   # Step 3A: Phase count, final eval
│   ├── AssignmentSetupStep.js    # Step 3B: Define assignments
│   ├── AssignmentConfigModal.js  # Configure single assignment
│   ├── CriteriaCustomizer.js     # Edit rubric criteria
│   ├── DueDatesStep.js      # Step 4: Set due dates
│   └── OptionsStep.js       # Step 5: Comments, late policy, etc.
└── index.js
```

### 2.2 Wizard State Management

```javascript
const wizardState = {
  step: 1,
  classType: null,  // 'phases' | 'assignments' | 'custom'

  // Basic info
  name: '',
  section: '',
  semester: '',
  timezone: 'America/New_York',

  // Phase mode config
  numPhases: 3,
  hasFinalEvaluation: true,
  phaseDueDates: {},
  phaseCriteria: [],  // Custom criteria or default

  // Assignment mode config
  assignments: [],
  /*
    Assignment shape:
    {
      name: 'Ethics Presentation',
      description: '',
      dueDate: '2025-10-15T23:59',
      evalTypes: [
        {
          type: 'peer',
          name: 'Teammate Evaluation',
          targetType: 'individual',
          weight: 0.7,
          includeSelf: true,
          criteria: [...],
          requireComments: true,
          minCommentWords: 10,
        },
        {
          type: 'audience',
          name: 'Presentation Rating',
          targetType: 'group',
          weight: 0.3,
          minCompletion: 6,
          criteria: [...],
        }
      ]
    }
  */

  // Shared options
  allowLateSubmissions: true,
  requireComments: false,
  minCommentWords: 10,
};
```

### 2.3 API Endpoints

```javascript
// POST /api/classes/wizard
// Creates class with full configuration in one request
{
  classType: 'assignments',
  name: 'Historical & Ethical Perspectives',
  section: '001',
  semester: 'Fall 2025',
  timezone: 'America/New_York',
  assignments: [...],
  // OR for phases mode:
  numPhases: 3,
  hasFinalEvaluation: true,
  phaseDueDates: {...},
  phaseCriteria: [...],
}

// GET /api/templates
// Returns all evaluation templates

// POST /api/templates
// Create custom template (saves for reuse)
```

### Files to Create/Modify
- `frontend/src/components/admin/ClassWizard/*` - New wizard components
- `frontend/src/pages/AdminDashboard.js` - Replace "Add Class" button with wizard
- `backend/routes/classes.js` - Add `/wizard` endpoint
- `backend/routes/templates.js` - New route for template CRUD

---

## Phase 2B: Class Settings Panel (Edit Mode)

After class creation, instructors edit via a **tabbed settings panel** rather than re-entering the wizard. This provides quick access to specific settings without navigating multiple steps.

### 2B.1 Settings Panel Structure

```
frontend/src/components/admin/ClassSettings/
├── ClassSettingsModal.js      # Main modal container with tabs
├── tabs/
│   ├── BasicInfoTab.js        # Name, section, semester, timezone
│   ├── PhasesTab.js           # Phase mode: num phases, due dates, criteria
│   ├── AssignmentsTab.js      # Assignment mode: list of assignments
│   ├── OptionsTab.js          # Comments, late policy, extensions
│   └── DangerZoneTab.js       # Archive/delete class
└── index.js
```

### 2B.2 Tab Layout by Class Mode

**Phase Mode Tabs:**
```
┌────────┬─────────────────┬──────────┬─────────┬──────────────┐
│ Basic  │ Phases & Dates  │ Criteria │ Options │ Danger Zone  │
└────────┴─────────────────┴──────────┴─────────┴──────────────┘
```

**Assignment Mode Tabs:**
```
┌────────┬─────────────┬─────────┬──────────────┐
│ Basic  │ Assignments │ Options │ Danger Zone  │
└────────┴─────────────┴─────────┴──────────────┘
```

### 2B.3 Tab Designs

#### Basic Info Tab (Both Modes)
```
┌─────────────────────────────────────────────────────────────────┐
│ Basic Info                                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Class Name                                                     │
│  [Historical & Ethical Perspectives in CS           ]           │
│                                                                 │
│  Section              Semester                                  │
│  [001    ]            [Fall 2025           ]                    │
│                                                                 │
│  Timezone                                                       │
│  [America/New_York                              ▼]              │
│                                                                 │
│  Evaluation Mode                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📋 Assignments Mode                                      │   │
│  │ This class uses assignment-based evaluations.            │   │
│  │ Mode cannot be changed after class creation.             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                              [Save Changes]     │
└─────────────────────────────────────────────────────────────────┘
```

#### Phases & Dates Tab (Phase Mode Only)
```
┌─────────────────────────────────────────────────────────────────┐
│ Phases & Due Dates                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Number of Phases                                               │
│  ○ 1  ○ 2  ● 3  ○ 4  ○ 5                                       │
│                                                                 │
│  ⚠️ Reducing phases will hide (not delete) existing evals       │
│                                                                 │
│  Due Dates                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Phase 1    [Oct 15, 2025    ] [11:59 PM ▼]              │   │
│  │ Phase 2    [Nov 15, 2025    ] [11:59 PM ▼]              │   │
│  │ Phase 3    [Dec 10, 2025    ] [11:59 PM ▼]              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Final Evaluation                                               │
│  [✓] Include final point allocation (23 points)                │
│      Due: [Dec 15, 2025    ] [11:59 PM ▼]                      │
│                                                                 │
│                                              [Save Changes]     │
└─────────────────────────────────────────────────────────────────┘
```

#### Criteria Tab (Phase Mode Only)
```
┌─────────────────────────────────────────────────────────────────┐
│ Evaluation Criteria                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Students will rate teammates on these criteria:                │
│                                                                 │
│  Template: [Peer Evaluation (Teammate) ▼]  [Apply Template]     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ☰ Contribution                                    [×]   │   │
│  │   [Contributed fair share to the team's work    ]        │   │
│  │   Scale: [1] to [5]                                      │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ ☰ Communication                                   [×]   │   │
│  │   [Communicated clearly and kept team informed  ]        │   │
│  │   Scale: [1] to [5]                                      │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ ☰ Reliability                                     [×]   │   │
│  │   [Met deadlines and followed through           ]        │   │
│  │   Scale: [1] to [5]                                      │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ ☰ Quality of Work                                 [×]   │   │
│  │   [Produced high-quality work                   ]        │   │
│  │   Scale: [1] to [5]                                      │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ ☰ Collaboration                                   [×]   │   │
│  │   [Worked well with others                      ]        │   │
│  │   Scale: [1] to [5]                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [+ Add Criterion]                                              │
│                                                                 │
│  ⚠️ Changing criteria affects future evaluations only.          │
│     Existing evaluations retain their original criteria.        │
│                                                                 │
│  [ ] Save as template: [                         ]              │
│                                                                 │
│                                              [Save Changes]     │
└─────────────────────────────────────────────────────────────────┘
```

#### Assignments Tab (Assignment Mode Only)
```
┌─────────────────────────────────────────────────────────────────┐
│ Assignments                                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. Ethics Presentation                   Due: Oct 15    │   │
│  │    • Teammate Evaluations (70%)                  [Edit] │   │
│  │    • Audience Ratings (30%)                             │   │
│  │    • Self-Evaluation                            [Delete]│   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 2. Research Paper & Presentation         Due: Dec 1     │   │
│  │    • Teammate Evaluations (70%)                  [Edit] │   │
│  │    • Audience Ratings (30%)                             │   │
│  │    • Self-Evaluation                            [Delete]│   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [+ Add Assignment]                                             │
│                                                                 │
│  ⚠️ Deleting an assignment will remove all its evaluations.     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Clicking [Edit] opens the same `AssignmentConfigModal` from the wizard, pre-populated with existing data.

#### Options Tab (Both Modes)
```
┌─────────────────────────────────────────────────────────────────┐
│ Options                                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Comments                                                       │
│  [✓] Require comments on evaluations                           │
│      Minimum words: [10    ]                                    │
│                                                                 │
│  Self-Evaluation (Phase Mode)                                   │
│  [ ] Include self-evaluation in each phase                      │
│                                                                 │
│  Late Submissions                                               │
│  ● Allow late submissions (flagged in reports)                  │
│  ○ Hard cutoff (no submissions after due date)                  │
│                                                                 │
│  Student Extensions                                             │
│  [Manage Extensions →]                                          │
│  Currently: 3 students have extensions                          │
│                                                                 │
│                                              [Save Changes]     │
└─────────────────────────────────────────────────────────────────┘
```

#### Danger Zone Tab (Both Modes)
```
┌─────────────────────────────────────────────────────────────────┐
│ Danger Zone                                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ⚠️ Archive Class                                         │   │
│  │                                                          │   │
│  │ Archiving hides this class from students and the         │   │
│  │ active class list. Data is preserved and can be          │   │
│  │ restored later.                                          │   │
│  │                                                          │   │
│  │                                    [Archive Class]       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🗑️ Delete Class                                          │   │
│  │                                                          │   │
│  │ Permanently delete this class and ALL associated data    │   │
│  │ including students, groups, and evaluations.             │   │
│  │ This action cannot be undone.                            │   │
│  │                                                          │   │
│  │ Type "DELETE" to confirm: [          ]                   │   │
│  │                                                          │   │
│  │                                    [Delete Class]        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2B.4 Shared Components

The settings panel reuses these components from the wizard:
- `AssignmentConfigModal.js` - Configure a single assignment
- `CriteriaCustomizer.js` - Edit rubric criteria (draggable, add/remove)

### 2B.5 API Endpoints for Settings

```javascript
// GET /api/classes/:id/settings
// Returns full class configuration for settings panel
{
  id: 1,
  name: 'Historical & Ethical Perspectives',
  section: '001',
  semester: 'Fall 2025',
  timezone: 'America/New_York',
  evaluation_mode: 'assignments',

  // Phase mode fields (if applicable)
  num_phases: null,
  has_final_evaluation: null,
  phase_due_dates: null,
  criteria: null,

  // Assignment mode fields (if applicable)
  assignments: [...],

  // Shared options
  require_comments: true,
  min_comment_words: 10,
  allow_late: true,
  include_self_eval: false,

  // Stats
  extensions_count: 3,
  evaluations_count: 45,
}

// PATCH /api/classes/:id/settings/basic
// Update basic info only
{ name, section, semester, timezone }

// PATCH /api/classes/:id/settings/phases
// Update phase configuration (phase mode only)
{ num_phases, has_final_evaluation, phase_due_dates }

// PATCH /api/classes/:id/settings/criteria
// Update criteria (phase mode only)
{ criteria: [...] }

// PATCH /api/classes/:id/settings/options
// Update options
{ require_comments, min_comment_words, allow_late, include_self_eval }

// POST /api/classes/:id/assignments
// Add new assignment (assignment mode only)

// PATCH /api/classes/:id/assignments/:assignmentId
// Update assignment

// DELETE /api/classes/:id/assignments/:assignmentId
// Delete assignment (with confirmation)

// POST /api/classes/:id/archive
// Archive class

// DELETE /api/classes/:id
// Permanently delete class (requires confirmation)
```

### 2B.6 Edit Safeguards

When editing, show warnings for destructive actions:

| Action | Warning |
|--------|---------|
| Reduce num_phases | "Reducing phases will hide (not delete) existing evaluations for removed phases." |
| Delete assignment | "Deleting this assignment will permanently remove X evaluations. This cannot be undone." |
| Change criteria | "Changing criteria affects future evaluations only. Existing evaluations retain their original criteria." |
| Delete class | Requires typing "DELETE" to confirm |

### 2B.7 Files to Create

```
frontend/src/components/admin/ClassSettings/
├── ClassSettingsModal.js
├── tabs/
│   ├── BasicInfoTab.js
│   ├── PhasesTab.js
│   ├── AssignmentsTab.js
│   ├── CriteriaTab.js
│   ├── OptionsTab.js
│   └── DangerZoneTab.js
└── index.js
```

### 2B.8 Entry Point

The settings panel is opened from:
1. **Class card** - Click gear icon or "Settings" in dropdown menu
2. **Admin dashboard** - When viewing a class, click "Class Settings" button

```jsx
// In ClassCard or AdminDashboard
<Button onClick={() => setShowSettings(true)}>
  <GearIcon /> Settings
</Button>

<ClassSettingsModal
  isOpen={showSettings}
  classId={selectedClass.id}
  onClose={() => setShowSettings(false)}
  onSave={handleSettingsSaved}
/>
```

---

## Phase 3: Assignment Mode - Student UI

### 3.1 Dashboard Updates

Modify `Dashboard.js` to handle assignment mode:

```javascript
// Detect class mode and render appropriately
if (currentClass.evaluation_mode === 'assignments') {
  return <AssignmentDashboard class={currentClass} />;
} else {
  return <PhaseDashboard class={currentClass} />;  // Existing UI
}
```

### 3.2 New Components

```
frontend/src/components/student/
├── AssignmentDashboard.js      # Shows assignments with completion status
├── AssignmentCard.js           # Single assignment with eval types
├── EvalTypeProgress.js         # Progress for peer/audience/self
├── GroupSelector.js            # Select group to evaluate (audience)
└── AssignmentEvaluation.js     # Evaluation form for assignment mode
```

### 3.3 Assignment Dashboard Layout

```jsx
// AssignmentDashboard.js
<div className="assignments-list">
  {assignments.map(assignment => (
    <AssignmentCard key={assignment.id} assignment={assignment}>
      {assignment.evalTypes.map(evalType => (
        <EvalTypeProgress
          key={evalType.id}
          evalType={evalType}
          completion={getCompletion(evalType)}
          onClick={() => navigateToEval(assignment, evalType)}
        />
      ))}
    </AssignmentCard>
  ))}
</div>
```

### 3.4 Audience Evaluation Flow

```jsx
// When clicking on "Presentation Ratings"
// 1. Show GroupSelector with all groups except student's own
// 2. Mark completed groups
// 3. On group select, show evaluation form
// 4. Submit saves to group_evaluations table
```

### 3.5 API Endpoints

```javascript
// GET /api/assignments?class_id=X
// Returns assignments with eval types and completion status for current user

// GET /api/assignments/:id/groups
// Returns groups to evaluate (excludes user's own group)

// POST /api/assignments/evaluations
// Submit individual evaluation (peer/self)
{
  evalTypeId: 1,
  evaluateeId: 5,
  scores: { criterionId: score, ... },
  comments: '...'
}

// POST /api/assignments/group-evaluations
// Submit group evaluation (audience)
{
  evalTypeId: 2,
  groupId: 3,
  scores: { criterionId: score, ... },
  comments: '...'
}

// GET /api/assignments/evaluations/:evalTypeId
// Get existing evaluations for auto-save/resume
```

### Files to Create/Modify
- `frontend/src/components/student/*` - New student components
- `frontend/src/pages/Dashboard.js` - Add mode detection
- `frontend/src/pages/AssignmentEvaluation.js` - New evaluation page
- `backend/routes/assignments.js` - New route file
- `backend/routes/index.js` - Register assignments routes

---

## Phase 4: Assignment Mode - Instructor Reports

### 4.1 Report Components

```
frontend/src/components/admin/reports/
├── AssignmentReports.js        # Main reports container
├── AssignmentOverview.js       # Summary table of all assignments
├── GroupDetailReport.js        # Deep dive into one group
├── StudentDetailReport.js      # Deep dive into one student
├── CompletionTracker.js        # Who completed what
├── AnomalyFlags.js             # Self vs peer gaps, below threshold
└── ExportButtons.js            # CSV, PDF export triggers
```

### 4.2 Report Data Structure

```javascript
// GET /api/reports/assignment-overview?class_id=X
{
  assignments: [
    {
      id: 1,
      name: 'Ethics Presentation',
      groups: [
        {
          id: 1,
          name: 'The Algorithmics',
          audienceAvg: 4.2,
          audienceCriteria: { clarity: 4.5, research: 4.0, ... },
          peerAvg: 4.1,
          members: [
            { id: 1, name: 'Alice', peerReceived: 4.3, self: 4.5, gap: 0.2 },
            { id: 2, name: 'Bob', peerReceived: 3.8, self: 4.8, gap: 1.0, flag: 'inflated' },
          ]
        }
      ]
    }
  ],
  completion: [
    { studentId: 1, name: 'Alice', peer: '3/3', self: true, audience: '6/6', status: 'complete' },
    { studentId: 2, name: 'Bob', peer: '3/3', self: true, audience: '4/6', status: 'below_threshold' },
  ]
}
```

### 4.3 Export Endpoints

```javascript
// GET /api/reports/export/wide-csv?class_id=X
// Returns CSV with one row per student, all scores as columns

// GET /api/reports/export/long-csv?class_id=X
// Returns CSV with one row per evaluation

// GET /api/reports/export/pdf?class_id=X
// Returns PDF report with full breakdown
```

### 4.4 PDF Generation

Use a library like `pdfkit` or `puppeteer` for PDF generation:

```javascript
// backend/services/pdfReport.js
const generatePDF = async (classId) => {
  const data = await getReportData(classId);

  const doc = new PDFDocument();

  // Cover page
  doc.text(`Evaluation Report: ${data.className}`);

  // Summary statistics
  // Per-assignment breakdown
  // Per-group details
  // Per-student summaries
  // Completion tracking
  // Anomaly flags

  return doc;
};
```

### Files to Create/Modify
- `frontend/src/components/admin/reports/*` - New report components
- `frontend/src/pages/AdminDashboard.js` - Add reports tab for assignment mode
- `backend/routes/reports.js` - New route for report data and exports
- `backend/services/pdfReport.js` - PDF generation service
- `package.json` - Add pdfkit or puppeteer dependency

---

## Phase 5: Enhanced Phase Mode

### 5.1 Custom Criteria Support

Update phase-based evaluation to support custom criteria:

```javascript
// When creating/editing phase-based class
// Allow customizing criteria instead of using hardcoded columns

// Evaluation submission checks:
// 1. If class has custom criteria → save to evaluation_criterion_scores
// 2. If class uses defaults → save to legacy columns (backward compat)
```

### 5.2 Migration for Existing Classes

```javascript
// Optional: Convert existing class to custom criteria
// POST /api/classes/:id/migrate-criteria
// Creates class_eval_criteria rows from default columns
// Future evaluations use new system
// Existing evaluations remain in legacy columns
```

### 5.3 Unified Criteria Editor

The `CriteriaCustomizer.js` component works for both modes:
- Phase mode: Creates `class_eval_criteria` rows
- Assignment mode: Creates `eval_type_criteria` rows

### Files to Modify
- `frontend/src/pages/Evaluation.js` - Support dynamic criteria
- `frontend/src/components/admin/EditClassModal.js` - Add criteria customization
- `backend/routes/evaluations.js` - Handle custom criteria scores
- `backend/routes/classes.js` - Add migrate-criteria endpoint

---

## Phase 6: Export Functionality

### 6.1 Wide CSV Format

```csv
student_name,student_email,group,assignment_1_peer_avg,assignment_1_self,assignment_1_audience,assignment_1_weighted,assignment_2_peer_avg,...,overall_weighted,completion_pct
"Alice Smith",alice@rit.edu,"The Algorithmics",4.3,4.5,4.2,4.27,4.1,...,4.17,100%
```

### 6.2 Long CSV Format

```csv
timestamp,evaluator_email,evaluatee_email,evaluatee_group,assignment,eval_type,criterion,score,comment
2025-10-14 23:45:00,alice@rit.edu,bob@rit.edu,"The Algorithmics","Ethics Presentation",peer,Contribution,4,""
2025-10-14 23:45:00,alice@rit.edu,bob@rit.edu,"The Algorithmics","Ethics Presentation",peer,Communication,3,""
```

### 6.3 PDF Report Sections

1. **Cover Page** - Class name, date generated, summary stats
2. **Executive Summary** - Key metrics, completion rates, flagged issues
3. **Assignment Breakdown** - Per-assignment statistics and charts
4. **Group Details** - Each group's audience scores + peer eval summary
5. **Individual Student Pages** - Per-student breakdown with comments
6. **Completion Matrix** - Visual grid of who completed what
7. **Appendix** - Raw data tables, criteria descriptions

### Files to Create
- `backend/services/csvExport.js` - CSV generation
- `backend/services/pdfReport.js` - PDF generation
- `backend/routes/reports.js` - Export endpoints

---

## File Summary

### New Files to Create

**Backend - Prisma:**
- `backend/prisma/schema.prisma` - Database schema definition
- `backend/prisma/seed.js` - Seed default templates
- `backend/prisma/migrations/` - Migration files (auto-generated)
- `backend/lib/prisma.js` - Prisma client singleton

**Backend - Routes & Services:**
- `backend/routes/assignments.js` - Assignment CRUD and evaluations
- `backend/routes/templates.js` - Template CRUD
- `backend/routes/reports.js` - Report data and exports
- `backend/services/csvExport.js` - CSV generation
- `backend/services/pdfReport.js` - PDF generation

**Frontend - Class Wizard:**
- `frontend/src/components/admin/ClassWizard/ClassWizard.js`
- `frontend/src/components/admin/ClassWizard/steps/ClassTypeStep.js`
- `frontend/src/components/admin/ClassWizard/steps/BasicInfoStep.js`
- `frontend/src/components/admin/ClassWizard/steps/PhaseConfigStep.js`
- `frontend/src/components/admin/ClassWizard/steps/AssignmentSetupStep.js`
- `frontend/src/components/admin/ClassWizard/steps/AssignmentConfigModal.js`
- `frontend/src/components/admin/ClassWizard/steps/CriteriaCustomizer.js`
- `frontend/src/components/admin/ClassWizard/steps/DueDatesStep.js`
- `frontend/src/components/admin/ClassWizard/steps/OptionsStep.js`

**Frontend - Class Settings Panel:**
- `frontend/src/components/admin/ClassSettings/ClassSettingsModal.js`
- `frontend/src/components/admin/ClassSettings/tabs/BasicInfoTab.js`
- `frontend/src/components/admin/ClassSettings/tabs/PhasesTab.js`
- `frontend/src/components/admin/ClassSettings/tabs/AssignmentsTab.js`
- `frontend/src/components/admin/ClassSettings/tabs/CriteriaTab.js`
- `frontend/src/components/admin/ClassSettings/tabs/OptionsTab.js`
- `frontend/src/components/admin/ClassSettings/tabs/DangerZoneTab.js`
- `frontend/src/components/student/AssignmentDashboard.js`
- `frontend/src/components/student/AssignmentCard.js`
- `frontend/src/components/student/EvalTypeProgress.js`
- `frontend/src/components/student/GroupSelector.js`
- `frontend/src/pages/AssignmentEvaluation.js`
- `frontend/src/components/admin/reports/AssignmentReports.js`
- `frontend/src/components/admin/reports/AssignmentOverview.js`
- `frontend/src/components/admin/reports/GroupDetailReport.js`
- `frontend/src/components/admin/reports/StudentDetailReport.js`
- `frontend/src/components/admin/reports/CompletionTracker.js`
- `frontend/src/components/admin/reports/ExportButtons.js`

### Files to Modify

**Backend:**
- `backend/database.js` - Add new tables
- `backend/routes/index.js` - Register new routes
- `backend/routes/classes.js` - Add wizard endpoint, mode support
- `backend/routes/evaluations.js` - Support custom criteria

**Frontend:**
- `frontend/src/pages/Dashboard.js` - Mode detection, route to correct UI
- `frontend/src/pages/Evaluation.js` - Support dynamic criteria
- `frontend/src/pages/AdminDashboard.js` - Wizard integration, reports tab
- `frontend/src/components/admin/EditClassModal.js` - Criteria customization

---

## Testing Checklist

### Phase Mode (Existing Functionality)
- [ ] Existing classes continue to work unchanged
- [ ] New phase-based classes can use default or custom criteria
- [ ] Legacy columns work for classes without custom criteria
- [ ] Custom criteria scores saved correctly
- [ ] Reports work for both legacy and custom criteria classes

### Assignment Mode (New Functionality)
- [ ] Wizard creates class with correct configuration
- [ ] Assignments display on student dashboard
- [ ] Peer evaluations work (individual → individual)
- [ ] Self evaluations work (configurable)
- [ ] Audience evaluations work (individual → group)
- [ ] Completion tracking accurate
- [ ] Minimum threshold enforcement works
- [ ] Late submission flagging works
- [ ] Extensions work for assignment mode
- [ ] Reports show correct data
- [ ] CSV exports generate correctly
- [ ] PDF exports generate correctly

### Edge Cases
- [ ] Student in no group cannot do peer evals
- [ ] Student cannot evaluate own group in audience mode
- [ ] Completion percentage handles optional eval types
- [ ] Weighted scores calculate correctly
- [ ] Self vs peer gap flags work

---

## Dependencies to Add

```json
{
  "pdfkit": "^0.13.0",  // or puppeteer for HTML→PDF
  "json2csv": "^6.0.0"  // CSV generation
}
```

---

## Rollout Strategy

1. **Deploy schema changes** - Additive, no breaking changes
2. **Deploy backend routes** - New endpoints, existing unchanged
3. **Deploy frontend** - Wizard available, existing classes unaffected
4. **Test with new class** - Create assignment-mode class, test full flow
5. **Documentation** - Update user guide with new features
6. **Training** - Demo wizard to instructors
