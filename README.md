# Peer Evaluation System

A web application for students to submit peer evaluations for semester-long group projects.

## Features

- **3-Phase Evaluation**: Evaluate teammates at each project phase
- **Likert Scale Ratings**: 5-point scale for Contribution, Communication, Reliability, Quality of Work, and Collaboration
- **Scores & Comments**: Score out of 100 and comments per phase, plus final overall comments
- **CSV Import**: Bulk import users and groups via CSV files
- **Admin Dashboard**: Manage users, groups, and view all evaluations
- **Self-Evaluation**: Students evaluate all group members including themselves

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
email,password,name,role
student1@example.com,password123,John Doe,student
student2@example.com,password123,Jane Smith,student
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
- `DELETE /api/users/:id` - Delete user

### Groups (Admin only for management)
- `GET /api/groups` - List all groups
- `GET /api/groups/my/group` - Get current user's group
- `POST /api/groups` - Create group
- `POST /api/groups/upload-csv` - Bulk import groups
- `POST /api/groups/:id/members` - Add member to group
- `DELETE /api/groups/:id` - Delete group

### Evaluations
- `GET /api/evaluations/my-evaluations` - Get user's submitted evaluations
- `POST /api/evaluations` - Submit/update evaluation
- `POST /api/evaluations/final-comments` - Submit/update final comments
- `GET /api/evaluations/all` - Get all evaluations (admin only)

## Evaluation Criteria (Likert Scale 1-5)

1. **Contribution** - Level of contribution to the project
2. **Communication** - Quality and frequency of communication
3. **Reliability** - Dependability and meeting deadlines
4. **Quality of Work** - Quality and thoroughness of work produced
5. **Collaboration** - Ability to work well with others
