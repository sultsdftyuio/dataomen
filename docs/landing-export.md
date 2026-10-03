# Landing page export

The root rewrite in `next.config.mjs` serves `public/landing/index.html`, taken from **Arcli Landing v3.dc.html** in the supplied redesign archive. Its design system and runtime bundles are generated assets; the minified copies preserve the export's layout and interactions. `public/landing/vendor/` holds the fixed runtime versions and their license notices.

`public/landing/adapter.js` connects the export's prototype controls to the app's sign-in, free brief, Pro, pilot, and legal routes. Website entries are passed through to the existing onboarding or pilot forms.

When replacing the export, retain the absolute `/landing/` asset paths, page metadata, adapter script, and root rewrite. Test both desktop and mobile rendering, plus the live calls to action.
