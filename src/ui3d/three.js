// The one place that knows where three.js lives. Everything in ui3d imports
// the library from here, so swapping the vendored copy (npm run vendor) or
// pointing at another build is a one-line change.

export * from '../../vendor/three.min.js';
