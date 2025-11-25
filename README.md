# Peer Evaluation System

A web application for students to submit peer evaluations for semester-long group projects.

## Features

### Core Evaluation
- **Configurable Phases**: Support for 1-5 evaluation phases per class
- **Optional Final Evaluation**: 23-point distribution among teammates
- **Likert Scale Ratings**: 5-point scale for Contribution, Communication, Reliability, Quality of Work, and Collaboration
- **Scores & Comments**: Score out of 100 and comments per phase, plus final overall comments
- **Self-Evaluation**: Students evaluate all group members including themselves
- **Auto-Save**: Evaluations auto-save as you type (with deadline protection)
- **Minimum Word Count**: Optional minimum word requirement for comments

### Due Dates & Deadlines
- **Per-Phase Due Dates**: Set deadlines for each phase with cascading defaults
- **Timezone Support**: Configure due dates in your local timezone
- **Deadline Enforcement**: Past-due phases are locked with visual indicators

### Administration
- **Admin Dashboard**: Manage users, groups, classes, and view all evaluations
- **Progress Dashboard**: Visual overview of class completion status
- **Evaluation Heat Map**: See exactly who has evaluated whom at a glance
- **Reports Tab**: Generate and export evaluation reports
- **CSV Import**: Bulk import users and groups via CSV files
- **Multiple Instructors**: Assign multiple instructors per class
- **View as Student**: Admins/teachers can preview any student's dashboard

### User Experience
- **Dark Mode**: Toggle between light and dark themes
- **Confetti Celebrations**: Fun animations when completing all evaluations
- **Class Selection Memory**: Remembers your last selected class
- **Responsive Design**: Works on desktop and mobile devices

## Due Date System

### Per-Phase Due Dates
Each phase can have its own due date. The system uses cascading logic for phases without explicit dates:

- If a phase has no due date set, it inherits from the next phase with a date
- Example: If Phase 1 and 2 have no dates but Phase 3 is set to Dec 15, then Phases 1 and 2 also use Dec 15
- The last phase (or Final Evaluation if enabled) is always required

### Deadline Enforcement
- Students cannot submit or modify evaluations after the phase deadline
- Past-due phases show a lock icon in the UI
- Teachers and admins can always edit regardless of deadlines

## Setup

### Prerequisites
- Node.js (v16 or higher)
- npm

### Backend Setup

```bash
cd backend
npm install
npm run dev
```

The backend runs on `http://localhost:3001`

### Frontend Setup

```bash
cd frontend
npm install
npm start
```

The frontend runs on `http://localhost:3000`

## Default Admin Account

- **Email**: admin@example.com
- **Password**: admin123

## CSV Formats

### Users CSV
```csv
email,password,first_name,last_name,role
student1@example.com,password123,John,Doe,student
student2@example.com,password123,Jane,Smith,student
teacher1@example.com,password123,Prof,Jones,teacher
```

### Groups CSV
```csv
group_name,user_email
Team Alpha,student1@example.com
Team Alpha,student2@example.com
Team Beta,student3@example.com
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Users (Admin only)
- `GET /api/users` - List all users
- `POST /api/users` - Create user
- `POST /api/users/upload-csv` - Bulk import users
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Classes (Admin/Teacher)
- `GET /api/classes` - List classes (filtered by role)
- `POST /api/classes` - Create class
- `PUT /api/classes/:id` - Update class (including phase due dates)
- `DELETE /api/classes/:id` - Delete class

### Groups (Admin only for management)
- `GET /api/groups` - List all groups
- `GET /api/groups/my/group` - Get current user's group
- `POST /api/groups` - Create group
- `POST /api/groups/upload-csv` - Bulk import groups
- `POST /api/groups/:id/members` - Add member to group
- `DELETE /api/groups/:id` - Delete group

### Evaluations
- `GET /api/evaluations/my-evaluations` - Get user's submitted evaluations
- `GET /api/evaluations/is-read-only` - Check if phase is past due
- `POST /api/evaluations` - Submit/update evaluation
- `POST /api/evaluations/final-comments` - Submit/update final comments
- `GET /api/evaluations/all` - Get all evaluations (admin only)
- `GET /api/evaluations/all-final-comments` - Get all final comments (admin only)
- `GET /api/evaluations/summary/:userId` - Get evaluation summary (admin only)

## Evaluation Criteria (Likert Scale 1-5)

1. **Contribution** - Level of contribution to the project
2. **Communication** - Quality and frequency of communication
3. **Reliability** - Dependability and meeting deadlines
4. **Quality of Work** - Quality and thoroughness of work produced
5. **Collaboration** - Ability to work well with others

## Class Configuration

When creating or editing a class, you can configure:

- **Class Name**: Required identifier for the class
- **Section**: Optional section number (e.g., "001")
- **Semester**: Optional semester label (e.g., "Fall 2024")
- **Number of Phases**: 1-5 evaluation phases
- **Final Evaluation**: Enable/disable the 23-point distribution
- **Due Date Timezone**: Select from common US timezones or UTC
- **Phase Due Dates**: Set individual deadlines per phase
- **Minimum Comment Words**: Optional minimum word count for evaluation comments
- **Instructors**: Assign one or more instructors

## Admin Dashboard Tabs

The admin dashboard is organized into tabs (ordered by frequency of use):

1. **Progress** - Monitor evaluation completion across the class
   - Overall completion percentage with progress bar
   - Per-phase completion breakdown
   - **Evaluation Heat Map**: Visual matrix showing who evaluated whom
   - "Who Needs a Nudge?" section listing incomplete students
   - Filter by group
   - Confetti celebration when class reaches 100% completion

2. **Reports** - View and analyze evaluation results
   - Summary statistics per student
   - Detailed evaluation breakdowns
   - Export capabilities

3. **Evaluations** - Browse all submitted evaluations
   - Filter by phase, student, or group
   - View individual evaluation details

4. **Groups** - Manage student groups
   - Create/edit/delete groups
   - CSV bulk import
   - View group membership

5. **Users** - Manage system users
   - Create/edit/delete users
   - CSV bulk import
   - Role management (admin, teacher, student)
   - Password reset

## Security

- Passwords are hashed using bcrypt with 10 salt rounds
- JWT-based authentication
- Set `JWT_SECRET` environment variable in production
- Role-based access control (admin, teacher, student)
