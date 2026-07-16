/**
 * External links used across the app.
 *
 * Kept in its own module on purpose: a platform-specific file (Foo.native.tsx)
 * importing a runtime value from its own sibling path ('./Foo') resolves back
 * to *itself* on native, so the value comes back undefined. Shared constants
 * must live somewhere neutral.
 */

/** Customer scheme enrolment portal, printed on the gold trend poster. */
export const IGP_URL = 'https://www.igp.indriya.com/';
