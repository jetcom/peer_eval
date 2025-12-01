const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default admin users
  const hashedPassword = bcrypt.hashSync('changeme', 10);

  await prisma.user.upsert({
    where: { email: 'jxbvcs@rit.edu' },
    update: {},
    create: {
      email: 'jxbvcs@rit.edu',
      password: hashedPassword,
      firstName: 'Jeremy',
      lastName: 'Brown',
      role: 'admin',
      mustChangePassword: 1,
      protected: 1,
    },
  });

  await prisma.user.upsert({
    where: { email: 'sxjcs@rit.edu' },
    update: {},
    create: {
      email: 'sxjcs@rit.edu',
      password: hashedPassword,
      firstName: 'Scott',
      lastName: 'Johnson',
      role: 'admin',
      mustChangePassword: 1,
      protected: 1,
    },
  });

  console.log('Created admin users');

  // Create evaluation templates
  // Template 1: Peer Evaluation (Teammate)
  const peerTemplate = await prisma.evalTemplate.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Peer Evaluation (Teammate)',
      description: 'Standard teammate evaluation rubric',
      targetType: 'individual',
      isSystem: 1,
    },
  });

  // Add criteria for peer template
  const peerCriteria = [
    { name: 'Contribution', description: 'Contributed fair share to the team\'s work', orderIndex: 1 },
    { name: 'Communication', description: 'Communicated clearly and kept team informed', orderIndex: 2 },
    { name: 'Reliability', description: 'Met deadlines and followed through on commitments', orderIndex: 3 },
    { name: 'Quality of Work', description: 'Produced high-quality work', orderIndex: 4 },
    { name: 'Collaboration', description: 'Worked well with others, receptive to feedback', orderIndex: 5 },
  ];

  for (const criterion of peerCriteria) {
    await prisma.evalTemplateCriterion.upsert({
      where: {
        id: criterion.orderIndex, // Using orderIndex as a proxy for id for upsert
      },
      update: {},
      create: {
        templateId: peerTemplate.id,
        ...criterion,
      },
    });
  }

  // Template 2: Presentation Rubric
  const presentationTemplate = await prisma.evalTemplate.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: 'Presentation Rubric',
      description: 'Evaluate group presentations',
      targetType: 'group',
      isSystem: 1,
    },
  });

  const presentationCriteria = [
    { name: 'Clarity', description: 'Information was presented clearly and logically', orderIndex: 1 },
    { name: 'Research Depth', description: 'Topic was thoroughly researched with credible sources', orderIndex: 2 },
    { name: 'Engagement', description: 'Presenters engaged the audience effectively', orderIndex: 3 },
    { name: 'Visual Design', description: 'Slides/visuals were professional and supported the content', orderIndex: 4 },
    { name: 'Q&A Handling', description: 'Questions were answered thoughtfully and accurately', orderIndex: 5 },
  ];

  for (const criterion of presentationCriteria) {
    await prisma.evalTemplateCriterion.upsert({
      where: { id: 5 + criterion.orderIndex },
      update: {},
      create: {
        templateId: presentationTemplate.id,
        ...criterion,
      },
    });
  }

  // Template 3: Paper Review
  const paperTemplate = await prisma.evalTemplate.upsert({
    where: { id: 3 },
    update: {},
    create: {
      name: 'Paper Review',
      description: 'Evaluate written work',
      targetType: 'individual',
      isSystem: 1,
    },
  });

  const paperCriteria = [
    { name: 'Thesis/Argument', description: 'Clear, well-articulated central argument', orderIndex: 1 },
    { name: 'Evidence', description: 'Strong supporting evidence from credible sources', orderIndex: 2 },
    { name: 'Analysis', description: 'Thoughtful analysis and critical thinking', orderIndex: 3 },
    { name: 'Organization', description: 'Logical structure and flow', orderIndex: 4 },
    { name: 'Writing Quality', description: 'Clear prose, proper grammar and citations', orderIndex: 5 },
  ];

  for (const criterion of paperCriteria) {
    await prisma.evalTemplateCriterion.upsert({
      where: { id: 10 + criterion.orderIndex },
      update: {},
      create: {
        templateId: paperTemplate.id,
        ...criterion,
      },
    });
  }

  // Template 4: Self-Evaluation
  const selfTemplate = await prisma.evalTemplate.upsert({
    where: { id: 4 },
    update: {},
    create: {
      name: 'Self-Evaluation',
      description: 'Student self-assessment',
      targetType: 'individual',
      isSystem: 1,
    },
  });

  const selfCriteria = [
    { name: 'Contribution', description: 'How much did you contribute to the team?', orderIndex: 1 },
    { name: 'Effort', description: 'How much effort did you put into this assignment?', orderIndex: 2 },
    { name: 'Learning', description: 'How much did you learn from this experience?', orderIndex: 3 },
  ];

  for (const criterion of selfCriteria) {
    await prisma.evalTemplateCriterion.upsert({
      where: { id: 15 + criterion.orderIndex },
      update: {},
      create: {
        templateId: selfTemplate.id,
        ...criterion,
      },
    });
  }

  console.log('Created evaluation templates');
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
