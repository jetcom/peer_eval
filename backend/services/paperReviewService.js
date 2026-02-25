const prisma = require('../lib/prisma');

/**
 * Start the review period for a paper review round.
 *
 * Extracts the core logic so it can be called from both:
 *   - the POST /:roundId/start-review route handler (teacher-initiated)
 *   - the auto-start scheduler (cron-initiated)
 *
 * @param {number} evalTypeId  – the evalType ID that identifies the round
 * @param {object} [options]
 * @param {number} [options.durationHours] – override review duration (hours)
 * @returns {{ success: boolean, assignmentsCreated?: number, reviewDeadline?: string, error?: string }}
 */
async function startReviewPeriod(evalTypeId, options = {}) {
  const round = await prisma.paperReviewRound.findUnique({
    where: { evalTypeId },
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
    return { success: false, error: 'Round not found' };
  }

  if (round.status !== 'submission') {
    return { success: false, error: 'Review period already started' };
  }

  // Get list of students who submitted (or all students if not requiring submission)
  let eligibleStudents;
  if (round.requireSubmissionToReview === 1) {
    eligibleStudents = round.papers.map(p => p.authorId);
  } else {
    eligibleStudents = round.evalType.assignment.class.enrollments.map(e => e.userId);
  }

  if (eligibleStudents.length < 2) {
    return { success: false, error: 'Need at least 2 students to start review' };
  }

  // Get papers to assign (only from students who submitted)
  const papersToAssign = round.papers;
  if (papersToAssign.length < 2) {
    return { success: false, error: 'Need at least 2 papers to start review' };
  }

  // Create circular assignments (shuffle for randomness)
  const shuffled = [...papersToAssign].sort(() => Math.random() - 0.5);
  const assignments = shuffled.map((paper, i) => ({
    roundId: round.id,
    reviewerId: paper.authorId,
    paperId: shuffled[(i + 1) % shuffled.length].id
  }));

  // Calculate review deadline
  const durationHours = options.durationHours || round.reviewDurationHours;
  const reviewStartedAt = new Date();
  const reviewDeadline = new Date(reviewStartedAt.getTime() + durationHours * 60 * 60 * 1000);

  // Update round and create assignments in transaction
  await prisma.$transaction([
    prisma.paperReviewRound.update({
      where: { evalTypeId },
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

  return {
    success: true,
    assignmentsCreated: assignments.length,
    reviewDeadline: reviewDeadline.toISOString()
  };
}

module.exports = { startReviewPeriod };
