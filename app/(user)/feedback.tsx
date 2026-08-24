// Wrapped in a local component function on purpose — a bare
// `export default PocFeedbackForm;` re-export was resolving to `undefined`
// at runtime in the release Android bundle (React Compiler experiment +
// Metro combo), which crashed expo-router's `fromImport` with
// "Cannot read property 'ErrorBoundary' of undefined" and killed the app
// right after login. The wrapper is a plain declaration the compiler
// can't mis-analyse, and matches how every other tab route is authored.
import { PocFeedbackForm } from '../../components/feedback/PocFeedbackForm';
export default function UserFeedback() { return <PocFeedbackForm />; }
