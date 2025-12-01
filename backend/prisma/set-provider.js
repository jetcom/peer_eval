// Sets the Prisma provider based on DATABASE_URL
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf8');

const isPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres');
const provider = isPostgres ? 'postgresql' : 'sqlite';

const updatedSchema = schema.replace(
  /provider\s*=\s*["'](sqlite|postgresql)["']/,
  `provider = "${provider}"`
);

fs.writeFileSync(schemaPath, updatedSchema);
console.log(`Prisma provider set to: ${provider}`);
