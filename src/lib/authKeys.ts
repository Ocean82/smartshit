/** Browser-storage keys used by the sign-in / anonymous-mode flow. */

/** Set by cloudSync.setUserId while a user is signed in. */
export const USER_ID_KEY = 'smartsht-user-id'
/** Last signed-in user id on this browser (kept across sign-out to detect account switches). */
export const LAST_CLOUD_USER_KEY = 'smartsht-last-cloud-user'
/** sessionStorage flag: the sign-out notice was already shown this session. */
export const SIGNOUT_TOAST_FLAG = 'smartsht-signout-toast-shown'
/** One-shot hand-off of a shared workbook into the app. */
export const IMPORT_SHARED_KEY = 'smartsht-import-shared'
