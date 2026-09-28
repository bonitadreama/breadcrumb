# Privacy in Breadcrumb

- Records are saved automatically in IndexedDB within the current browser profile and origin.
- No health entries are sent to a server or language model. Breadcrumb adds no analytics, remote fonts, or third-party scripts. The public website host, GitHub Pages, receives ordinary website requests and may retain access logs; these are distinct from journal contents.
- GitHub Pages (or your local preview server) serves application files. Profiles do not provide authentication, encryption, or isolation from someone with access to the browser/device.
- Backup downloads contain readable health information. Treat them as private documents.
- Photos, captions, and annotations stay in the same local browser storage as entries. Breadcrumb does not upload or analyze photos. They are personal records, not diagnostic interpretations.
- Original photo bytes are retained unchanged, including any embedded camera or location metadata. Drawings are separate overlays. Exported backups contain the original images, captions, and annotation history; they are not encrypted.
- Removing a saved attachment hides it from the current entry but retains it in earlier versions and backups. Deleting an observation is also recoverable. Neither action permanently erases a photo. Closing an unsaved form does not persist its new photos.
- Corrections retain previous versions, including removed text. Moving an entry to Recently deleted only hides it from the timeline. These records and their history remain on the device and in backups; permanent erasure is not offered in this release.
- Persistent-storage permission may reduce automatic eviction. It does not protect against browser-data clearing or device loss.
- Restoring merges compatible records; it never silently overwrites conflicting versions. Importing does not send the backup over the network.
- Only fictional records belong in public bug reports, source repositories, screenshots, or tests.

The hosted app has the same browser-only journal storage as the local build. There is no server-side journal database or cloud recovery. A future service that receives or stores health records would require a separate review. No claim of HIPAA compliance is made.

Browser storage is scoped to the website origin, not an individual page path. Use only a trusted copy of the app and protect access to your device. A backup restored on a different device or website is an independent copy, not synchronization.
