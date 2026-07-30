// The only module that knows the API exists. Everything else calls these
// functions, which means changing a route or adding a header happens once.

const BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'stride-token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* private mode: session simply will not persist */ }
};

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields || [];
  }
}

async function request(path, { method = 'GET', body, formData } = {}) {
  const headers = {};
  if (!formData) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      setToken(null);
      window.dispatchEvent(new Event('stride:signed-out'));
    }
    throw new ApiError(data.error || 'Something went wrong.', response.status, data.fields);
  }
  return data;
}

const query = (params = {}) => {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== '' && value != null)
  ).toString();
  return search ? `?${search}` : '';
};

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),
  dashboard: () => request('/dashboard'),

  properties: (params) => request(`/properties${query(params)}`),
  property: (id) => request(`/properties/${id}`),
  propertyMatches: (id) => request(`/properties/${id}/matches`),
  createProperty: (body) => request('/properties', { method: 'POST', body }),
  setPropertyStatus: (id, status) => request(`/properties/${id}/status`, { method: 'PATCH', body: { status } }),

  media: (propertyId) => request(`/media/${propertyId}`),
  uploadMedia: (propertyId, files) => {
    const form = new FormData();
    Array.from(files).forEach((file) => form.append('photos', file));
    return request(`/media/${propertyId}`, { method: 'POST', formData: form });
  },
  deleteMedia: (id) => request(`/media/${id}`, { method: 'DELETE' }),

  applicants: () => request('/applicants'),
  applicantMatches: (contactId) => request(`/applicants/${contactId}/matches`),
  createApplicant: (body) => request('/applicants', { method: 'POST', body }),

  viewings: (params) => request(`/viewings${query(params)}`),
  createViewing: (body) => request('/viewings', { method: 'POST', body }),
  updateViewing: (id, body) => request(`/viewings/${id}`, { method: 'PATCH', body }),

  compliance: () => request('/compliance'),
  createCertificate: (body) => request('/compliance', { method: 'POST', body }),

  maintenance: () => request('/maintenance'),
  createTicket: (body) => request('/maintenance', { method: 'POST', body }),
  updateTicket: (id, body) => request(`/maintenance/${id}`, { method: 'PATCH', body }),

  documents: () => request('/documents'),
  askDocument: (id, question) => request(`/documents/${id}/ask`, { method: 'POST', body: { question } }),

  conciergeMeta: () => request('/concierge/meta'),
  conversations: () => request('/concierge'),
  conversation: (id) => request(`/concierge/${id}`),
  startConversation: (body) => request('/concierge', { method: 'POST', body }),
  sendConciergeMessage: (id, body) =>
    request(`/concierge/${id}/messages`, { method: 'POST', body: { body } }),
  conciergeHandover: (id, note) =>
    request(`/concierge/${id}/handover`, { method: 'POST', body: { note } }),

  sales: () => request('/sales'),
  createOffer: (body) => request('/sales/offers', { method: 'POST', body }),
  updateOffer: (id, status) => request(`/sales/offers/${id}`, { method: 'PATCH', body: { status } }),
  updateChainLink: (id, body) => request(`/sales/links/${id}`, { method: 'PATCH', body }),

  listingOptions: () => request('/listings/options'),
  listings: () => request('/listings'),
  generateListing: (body) => request('/listings/generate', { method: 'POST', body }),
};
