// Dev server proxy to the FastAPI backend, websockets included.
// Point it elsewhere with API_URL, e.g. API_URL=http://localhost:9000 npm start
const target = process.env.API_URL ?? 'http://localhost:8000';

export default {
  '/api': { target, ws: true, secure: false },
  '/docs': { target, secure: false },
  '/openapi.json': { target, secure: false },
};
