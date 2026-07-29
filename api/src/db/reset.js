// Drops everything and reseeds. `npm run db:reset` in the api folder.
import { db } from './index.js';
import { seed } from './seed.js';

// Order matters: children before parents, or the foreign keys complain.
const TABLES = [
  'activity', 'document_chunks', 'documents', 'listings', 'property_media',
  'maintenance_tickets', 'certificates', 'tasks', 'viewings', 'requirements',
  'properties', 'contacts', 'users', 'agencies',
];

db.migrate();
db.raw.exec('PRAGMA foreign_keys = OFF');
TABLES.forEach((table) => db.run(`DELETE FROM ${table}`));
db.raw.exec('PRAGMA foreign_keys = ON');

const summary = seed();

console.log('Database reset and seeded.');
Object.entries(summary).forEach(([key, value]) => console.log(`  ${key}: ${value}`));
console.log('\nSign in with:');
console.log('  owner@strideestates.co.uk / stride123');
console.log('  neg@strideestates.co.uk   / stride123');
