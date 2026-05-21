const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create users
  const hashedPassword = await bcrypt.hash('password123', 12);

  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      username: 'alice_dev',
      password: hashedPassword,
      bio: 'Full-stack developer and tech enthusiast',
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      username: 'bob_codes',
      password: hashedPassword,
      bio: 'Open source contributor',
    },
  });

  // Create communities
  const programming = await prisma.community.upsert({
    where: { slug: 'programming' },
    update: {},
    create: {
      name: 'programming',
      slug: 'programming',
      description: 'A community for programmers to discuss code, share projects, and learn.',
      creatorId: alice.id,
    },
  });

  const webdev = await prisma.community.upsert({
    where: { slug: 'webdev' },
    update: {},
    create: {
      name: 'webdev',
      slug: 'webdev',
      description: 'The web development subreddit. All things web dev!',
      creatorId: bob.id,
    },
  });

  const tech = await prisma.community.upsert({
    where: { slug: 'technology' },
    update: {},
    create: {
      name: 'technology',
      slug: 'technology',
      description: 'Subreddit dedicated to the concept of technology.',
      creatorId: alice.id,
    },
  });

  // Add members
  await prisma.communityMember.createMany({
    skipDuplicates: true,
    data: [
      { userId: alice.id, communityId: programming.id },
      { userId: bob.id, communityId: programming.id },
      { userId: alice.id, communityId: webdev.id },
      { userId: bob.id, communityId: webdev.id },
      { userId: alice.id, communityId: tech.id },
    ],
  });

  // Create posts
  const post1 = await prisma.post.create({
    data: {
      title: 'What programming language should I learn first in 2024?',
      content: 'I\'m a complete beginner and want to get into software development. I\'ve heard Python is great for beginners but also that JavaScript is everywhere. What do you all think?',
      type: 'TEXT',
      communityId: programming.id,
      authorId: bob.id,
      score: 142,
    },
  });

  const post2 = await prisma.post.create({
    data: {
      title: 'Built my first full-stack app with Next.js and PostgreSQL!',
      content: 'After 6 months of learning, I finally built my first complete web app. It\'s a task management tool with real-time updates. Tech stack: Next.js 14, PostgreSQL, Prisma, and Tailwind CSS. Feedback welcome!',
      type: 'TEXT',
      communityId: webdev.id,
      authorId: alice.id,
      score: 89,
    },
  });

  const post3 = await prisma.post.create({
    data: {
      title: 'The rise of AI coding assistants – are they making us better or worse programmers?',
      content: 'Hot take: tools like GitHub Copilot are great for productivity but terrible for learning. Beginners are losing the ability to debug and reason about code. Discuss.',
      type: 'TEXT',
      communityId: tech.id,
      authorId: bob.id,
      score: 234,
    },
  });

  // Create votes
  await prisma.vote.createMany({
    skipDuplicates: true,
    data: [
      { userId: alice.id, postId: post1.id, type: 'UP' },
      { userId: bob.id, postId: post2.id, type: 'UP' },
      { userId: alice.id, postId: post3.id, type: 'UP' },
    ],
  });

  // Create comments
  const comment1 = await prisma.comment.create({
    data: {
      content: 'Python is definitely the best starting point. The syntax is clean and there are tons of learning resources.',
      postId: post1.id,
      authorId: alice.id,
    },
  });

  await prisma.comment.create({
    data: {
      content: 'I\'d actually argue JavaScript is better because you can build things that run in the browser immediately, which is more motivating for beginners.',
      postId: post1.id,
      authorId: bob.id,
    },
  });

 
await prisma.comment.create({
  data: {
    content: 'I agree with this!...',
    postId: post1.id,
    authorId: bob.id,
    parentId: comment1.id,
  },
});

  console.log('✅ Database seeded successfully!');
  console.log('Test accounts:');
  console.log('  alice@example.com / password123');
  console.log('  bob@example.com / password123');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
