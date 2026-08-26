/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// La lampe torche n'est pas encore dans les types DOM standard, mais Chrome
// Android et Safari 17+ l'exposent via applyConstraints.
interface MediaTrackCapabilities { torch?: boolean }
interface MediaTrackConstraintSet { torch?: boolean }
