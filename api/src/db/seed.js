// ---------------------------------------------------------------------------
// Seed data. Realistic enough that the matching engine and the document
// search have something meaningful to chew on — a demo with three properties
// and no edge cases teaches you nothing about whether your logic works.
// ---------------------------------------------------------------------------

import { db } from './index.js';
import { hashPassword } from '../lib/auth.js';
import { uuid, now } from '../lib/helpers.js';
import { chunkDocument } from '../services/retrieval.js';

const daysFromNow = (days) =>
  new Date(Date.now() + days * 86400000).toISOString();
const dateFromNow = (days) => daysFromNow(days).slice(0, 10);

export function seed() {
  const timestamp = now();
  const agencyId = uuid();

  db.run('INSERT INTO agencies (id, name, slug, plan, created_at) VALUES (?,?,?,?,?)', [
    agencyId, 'Stride Estates (Demo)', 'stride-demo', 'trial', timestamp,
  ]);

  const owner = uuid();
  const negotiator = uuid();
  db.run(
    `INSERT INTO users (id, agency_id, email, name, role, password_hash, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [owner, agencyId, 'owner@strideestates.co.uk', 'Arun Yadav', 'owner',
     hashPassword('stride123'), timestamp]
  );
  db.run(
    `INSERT INTO users (id, agency_id, email, name, role, password_hash, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [negotiator, agencyId, 'neg@strideestates.co.uk', 'Priya Shah', 'negotiator',
     hashPassword('stride123'), timestamp]
  );

  // ----------------------------- landlords ---------------------------------
  const landlords = [
    ['Miriam', 'Okonjo', 'miriam.okonjo@example.com'],
    ['Tom', 'Whitfield', 'tom.whitfield@example.com'],
    ['Aisha', 'Rahman', 'aisha.rahman@example.com'],
  ].map(([first, last, email]) => {
    const id = uuid();
    db.run(
      `INSERT INTO contacts (id, agency_id, kind, first_name, last_name, email, created_at)
       VALUES (?,?,'landlord',?,?,?,?)`,
      [id, agencyId, first, last, email, timestamp]
    );
    return id;
  });

  // ---------------------------- properties ---------------------------------
  // Money in pence. Lets are monthly rent, sales are asking price.
  const properties = [
    ['let', 'Flat 4, 22 Kingsley Road', 'Hounslow', 'Hounslow West', 'TW3 1PA', 'flat', 2, 1, 165000, 'furnished', 1, 'C',
      ['garden', 'parking', 'balcony'], 'Bright two-bedroom flat with a shared garden and allocated parking.', -4, 3],
    ['let', '18 Ferndale Avenue', 'Hounslow', 'Feltham', 'TW14 9LQ', 'terraced', 3, 1, 210000, 'unfurnished', 0, 'D',
      ['garden', 'garage'], 'Three-bedroom terrace with a long rear garden, close to Feltham station.', -12, 14],
    ['let', 'Studio 2, 90 High Street', 'Brentford', 'Brentford', 'TW8 0AH', 'studio', 0, 1, 112500, 'furnished', 0, 'C',
      ['bills included'], 'Compact studio above a parade of shops. Bills included.', -30, 0],
    ['let', '7 Whitton Dene', 'Isleworth', 'Isleworth', 'TW7 7NG', 'semi', 4, 2, 285000, 'part', 1, 'B',
      ['garden', 'parking', 'ensuite'], 'Large four-bedroom semi with two bathrooms and off-street parking.', -2, 30],
    ['let', 'Flat 11, Concord House', 'Hounslow', 'Hounslow Central', 'TW3 3EF', 'flat', 1, 1, 138000, 'furnished', 0, 'C',
      ['balcony', 'lift', 'concierge'], 'One-bedroom apartment in a managed block with a concierge.', -55, 7],
    ['sale', '44 Vicarage Farm Road', 'Hounslow', 'Heston', 'TW5 0AB', 'semi', 3, 1, 47500000, null, 0, 'D',
      ['garden', 'driveway', 'extension potential'], 'Three-bedroom semi in need of modernisation, large plot.', -20, null],
    ['sale', '2 Chesterfield Court', 'Twickenham', 'Twickenham', 'TW1 3BE', 'flat', 2, 2, 39500000, null, 0, 'B',
      ['balcony', 'parking', 'ensuite'], 'Two-bedroom two-bathroom flat with a south-facing balcony.', -6, null],
    ['sale', '31 Springwell Road', 'Hounslow', 'Heston', 'TW5 9DE', 'detached', 4, 3, 82500000, null, 0, 'C',
      ['garden', 'garage', 'ensuite', 'driveway'], 'Substantial four-bedroom detached house with a double garage.', -1, null],
  ];

  const propertyIds = properties.map((row, index) => {
    const [listing, line1, city, area, postcode, type, beds, baths, price, furnished,
           pets, epc, features, description, createdOffset, availableOffset] = row;
    const id = uuid();
    const created = daysFromNow(createdOffset);

    db.run(
      `INSERT INTO properties
        (id, agency_id, reference, listing_type, status, line1, city, area, postcode,
         property_type, bedrooms, bathrooms, price_pence, furnished, pets_allowed, epc_rating,
         features, description, available_from, landlord_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, agencyId, `STR-${String(index + 1).padStart(4, '0')}`, listing,
       index === 2 ? 'let_agreed' : index === 6 ? 'under_offer' : 'available',
       line1, city, area, postcode, type, beds, baths, price, furnished, pets, epc,
       JSON.stringify(features), description,
       availableOffset === null ? null : dateFromNow(availableOffset),
       landlords[index % landlords.length], created, created]
    );
    return id;
  });

  // ---------------------------- applicants ---------------------------------
  const applicants = [
    ['Daniel', 'Mercer', 'daniel.mercer@example.com', '07700 900111', 'let', 140000, 180000, 2,
      ['Hounslow West', 'Hounslow Central'], ['flat'], ['garden'], 1, 'furnished', 21],
    ['Sophie', 'Lennox', 'sophie.lennox@example.com', '07700 900222', 'let', null, 225000, 3,
      ['Feltham', 'Hounslow'], ['terraced', 'semi'], ['garden', 'garage'], 0, 'unfurnished', 45],
    ['Kwame', 'Boateng', 'kwame.boateng@example.com', '07700 900333', 'let', 100000, 145000, 1,
      ['Brentford', 'Hounslow Central'], [], ['balcony'], 0, 'furnished', 10],
    ['Elena', 'Vasquez', 'elena.vasquez@example.com', '07700 900444', 'let', 240000, 300000, 4,
      ['Isleworth', 'Twickenham'], ['semi', 'detached'], ['ensuite', 'parking'], 1, 'part', 60],
    ['Raj', 'Patel', 'raj.patel@example.com', '07700 900555', 'sale', 40000000, 52000000, 3,
      ['Heston', 'Hounslow'], ['semi', 'terraced'], ['garden', 'driveway'], 0, null, 120],
    ['Hannah', 'Byrne', 'hannah.byrne@example.com', '07700 900666', 'sale', null, 85000000, 4,
      ['Heston'], ['detached'], ['garage', 'ensuite'], 0, null, 180],
  ];

  const applicantIds = applicants.map((row) => {
    const [first, last, email, phone, listing, minPrice, maxPrice, minBeds,
           areas, types, mustHaves, pets, furnished, moveIn] = row;
    const contactId = uuid();

    db.run(
      `INSERT INTO contacts (id, agency_id, kind, first_name, last_name, email, phone, created_at)
       VALUES (?,?,'applicant',?,?,?,?,?)`,
      [contactId, agencyId, first, last, email, phone, timestamp]
    );

    db.run(
      `INSERT INTO requirements
        (id, agency_id, contact_id, listing_type, min_price_pence, max_price_pence, min_bedrooms,
         areas, property_types, must_haves, needs_pets, furnished_pref, move_by, active, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
      [uuid(), agencyId, contactId, listing, minPrice, maxPrice, minBeds,
       JSON.stringify(areas), JSON.stringify(types), JSON.stringify(mustHaves),
       pets, furnished, dateFromNow(moveIn), timestamp]
    );

    return contactId;
  });

  // ----------------------------- viewings ----------------------------------
  const viewings = [
    [propertyIds[0], applicantIds[0], negotiator, 1, 10, 'booked'],
    [propertyIds[1], applicantIds[1], negotiator, 1, 14, 'booked'],
    [propertyIds[3], applicantIds[3], owner, 2, 11, 'booked'],
    [propertyIds[6], applicantIds[4], owner, -3, 15, 'attended'],
    [propertyIds[4], applicantIds[2], negotiator, -1, 12, 'no_show'],
  ];

  viewings.forEach(([propertyId, contactId, userId, dayOffset, hour, status]) => {
    const when = new Date(Date.now() + dayOffset * 86400000);
    when.setHours(hour, 0, 0, 0);
    db.run(
      `INSERT INTO viewings
        (id, agency_id, property_id, contact_id, user_id, starts_at, duration_min, status, created_at)
       VALUES (?,?,?,?,?,?,30,?,?)`,
      [uuid(), agencyId, propertyId, contactId, userId, when.toISOString(), status, timestamp]
    );
  });

  // --------------------------- certificates --------------------------------
  // Deliberately includes one already expired and two inside 30 days, so the
  // compliance screen has something real to shout about.
  const certificates = [
    [propertyIds[0], 'gas_safety', 'GS-88213', -14],
    [propertyIds[0], 'epc', 'EPC-4471', 300],
    [propertyIds[1], 'gas_safety', 'GS-88450', 12],
    [propertyIds[1], 'eicr', 'EICR-2201', 640],
    [propertyIds[3], 'gas_safety', 'GS-90112', 27],
    [propertyIds[3], 'deposit_protection', 'TDS-55190', 210],
    [propertyIds[4], 'epc', 'EPC-5120', 75],
    [propertyIds[4], 'right_to_rent', 'RTR-3390', 150],
  ];

  certificates.forEach(([propertyId, kind, reference, offset]) => {
    db.run(
      `INSERT INTO certificates
        (id, agency_id, property_id, kind, reference, issued_on, expires_on, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuid(), agencyId, propertyId, kind, reference,
       dateFromNow(offset - 365), dateFromNow(offset), timestamp]
    );
  });

  // --------------------------- maintenance ---------------------------------
  const tickets = [
    [propertyIds[0], applicantIds[0], 'Boiler losing pressure', 'Tenant reports pressure dropping every few days.', 'urgent', 'assigned'],
    [propertyIds[1], null, 'Loose gutter above front door', 'Noted at the last inspection.', 'normal', 'open'],
    [propertyIds[4], null, 'Communal lift out of service', 'Managing agent notified, awaiting engineer.', 'urgent', 'scheduled'],
  ];

  tickets.forEach(([propertyId, raisedBy, title, detail, priority, status]) => {
    db.run(
      `INSERT INTO maintenance_tickets
        (id, agency_id, property_id, raised_by, title, detail, priority, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uuid(), agencyId, propertyId, raisedBy, title, detail, priority, status, timestamp, timestamp]
    );
  });

  // ------------------------------ tasks ------------------------------------
  [
    ['Chase gas safety certificate for STR-0001', 1, propertyIds[0]],
    ['Send Sophie Lennox the Ferndale Avenue details', 0, propertyIds[1]],
    ['Book check-out inspection at Concord House', 3, propertyIds[4]],
  ].forEach(([title, dueOffset, propertyId]) => {
    db.run(
      `INSERT INTO tasks (id, agency_id, title, due_at, done, property_id, assigned_to, created_at)
       VALUES (?,?,?,?,0,?,?,?)`,
      [uuid(), agencyId, title, daysFromNow(dueOffset), propertyId, negotiator, timestamp]
    );
  });

  // ---------------------------- documents ----------------------------------
  // A shortened but realistic tenancy and building-rules pack. Page breaks are
  // marked [[page]] so citations can name a page number.
  const tenancyText = `ASSURED SHORTHOLD TENANCY AGREEMENT
This agreement is made between the Landlord and the Tenant in respect of the Property known as Flat 4, 22 Kingsley Road, Hounslow TW3 1PA.

The Term of this tenancy is twelve months commencing on the date of occupation. The Rent is one thousand six hundred and fifty pounds per calendar month, payable in advance on the first day of each month by standing order.

A deposit equal to five weeks rent shall be held in a Government approved tenancy deposit scheme. The deposit will be protected within thirty days of receipt and the prescribed information provided to the Tenant.
[[page]]
SECTION 2 — USE OF THE PROPERTY

The Tenant shall use the Property as a private dwelling for the occupation of the named Tenant and any permitted occupiers only. The Tenant shall not carry on any trade, business or profession at the Property without the prior written consent of the Landlord.

The Tenant shall not sublet the whole or any part of the Property. Short term lettings, including any arrangement advertised through a holiday or short stay platform such as Airbnb, are expressly prohibited and shall constitute a material breach of this agreement.

The Tenant shall not permit more than two adults to occupy the Property at any time without written consent.
[[page]]
SECTION 3 — PETS AND ANIMALS

The Tenant may keep one domestic cat or one dog at the Property with the prior written consent of the Landlord, which shall not be unreasonably withheld. Consent is refused for any dog listed under the Dangerous Dogs Act 1991, which includes the pit bull terrier.

Where a pet is kept, the Tenant shall arrange professional cleaning of all carpets and soft furnishings at the end of the tenancy at the Tenant's own expense.

The keeping of reptiles, rodents other than a single caged hamster, or any livestock is not permitted.
[[page]]
SECTION 4 — REPAIRS AND MAINTENANCE

The Landlord shall keep in repair the structure and exterior of the Property, including drains, gutters and external pipes, and shall keep in repair and proper working order the installations for the supply of water, gas, electricity and sanitation.

The Tenant shall report any disrepair or defect promptly. Emergency repairs, meaning any defect presenting a risk to health or safety or a risk of serious damage to the Property, shall be attended to within twenty four hours of being reported. Routine repairs shall be attended to within fourteen days.

The Tenant is responsible for replacing light bulbs, smoke alarm batteries and for keeping the Property adequately ventilated to prevent condensation and mould.
[[page]]
SECTION 5 — ACCESS AND INSPECTION

The Landlord or the Landlord's agent may enter the Property to inspect its condition or carry out repairs, having given the Tenant at least twenty four hours written notice, except in the case of an emergency where immediate access may be required.

Routine inspections shall be carried out no more than once every three months.
[[page]]
SECTION 6 — ENDING THE TENANCY

The Tenant may end this tenancy after the fixed term by giving not less than one month's written notice expiring on the last day of a rental period. The Landlord may seek possession in accordance with the Housing Act 1988 as amended.

Where the Tenant vacates leaving belongings at the Property, the Landlord shall store them for fourteen days before disposal.

Parking is permitted in the allocated bay numbered four only. Visitor parking is available in the marked bays for a maximum of four hours. Vehicles left in unmarked areas may be removed at the owner's expense.`;

  const documentId = uuid();
  const chunks = chunkDocument(tenancyText);
  const pageCount = chunks.reduce((max, chunk) => Math.max(max, chunk.page), 0);

  db.run(
    `INSERT INTO documents (id, agency_id, property_id, title, kind, page_count, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [documentId, agencyId, propertyIds[0], 'Tenancy agreement — 22 Kingsley Road', 'tenancy',
     pageCount, timestamp]
  );

  chunks.forEach((chunk) => {
    db.run(
      `INSERT INTO document_chunks
        (id, agency_id, document_id, page, paragraph, ordinal, content, token_count)
       VALUES (?,?,?,?,?,?,?,?)`,
      [chunk.id, agencyId, documentId, chunk.page, chunk.paragraph, chunk.ordinal,
       chunk.content, chunk.token_count]
    );
  });

  // ----------------------------- activity ----------------------------------
  [
    ['property', propertyIds[7], 'created', 'STR-0008 — 31 Springwell Road'],
    ['property', propertyIds[6], 'status', 'under_offer'],
    ['document', documentId, 'indexed', `${chunks.length} chunks across ${pageCount} pages`],
  ].forEach(([entity, entityId, action, detail], i) => {
    db.run(
      `INSERT INTO activity (id, agency_id, user_id, entity, entity_id, action, detail, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuid(), agencyId, owner, entity, entityId, action, detail, daysFromNow(-i)]
    );
  });

  return {
    agency: 1,
    users: 2,
    properties: propertyIds.length,
    applicants: applicantIds.length,
    viewings: viewings.length,
    certificates: certificates.length,
    maintenance: tickets.length,
    document_chunks: chunks.length,
  };
}
