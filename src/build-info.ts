// Version and source of this build (AGPL-3.0 section 13: users get a way to obtain the source).
import flexova from "../vendor/flexova.json";

declare const __FLEXPAD_VERSION__: string;
declare const __FLEXPAD_COMMIT__: string;

const REPOSITORY = "https://github.com/EagleMind/flexpad";

export const VERSION = __FLEXPAD_VERSION__;
export const COMMIT = __FLEXPAD_COMMIT__;
/** The source of exactly this build when its commit is known, else the repository. */
export const SOURCE_URL = COMMIT ? `${REPOSITORY}/tree/${COMMIT}` : REPOSITORY;
export const LICENSE_URL = `${REPOSITORY}/blob/${COMMIT || "main"}/LICENSE`;
export const FLEXOVA_COMMIT: string = flexova.commit;
