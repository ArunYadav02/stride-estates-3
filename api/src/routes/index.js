import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import authRoutes from './auth.js';
import dashboardRoutes from './dashboard.js';
import propertyRoutes from './properties.js';
import applicantRoutes from './applicants.js';
import viewingRoutes from './viewings.js';
import complianceRoutes from './compliance.js';
import documentRoutes from './documents.js';
import mediaRoutes from './media.js';
import listingRoutes from './listings.js';
import maintenanceRoutes from './maintenance.js';
import conciergeRoutes from './concierge.js';
import salesRoutes from './sales.js';

const router = Router();

router.use('/auth', authRoutes);

// Everything below this line requires a signed-in staff user.
router.use('/dashboard', requireAuth, dashboardRoutes);
router.use('/properties', requireAuth, propertyRoutes);
router.use('/applicants', requireAuth, applicantRoutes);
router.use('/viewings', requireAuth, viewingRoutes);
router.use('/compliance', requireAuth, complianceRoutes);
router.use('/documents', requireAuth, documentRoutes);
router.use('/media', requireAuth, mediaRoutes);
router.use('/listings', requireAuth, listingRoutes);
router.use('/maintenance', requireAuth, maintenanceRoutes);
router.use('/concierge', requireAuth, conciergeRoutes);
router.use('/sales', requireAuth, salesRoutes);

export default router;
