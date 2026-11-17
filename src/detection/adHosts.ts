/**
 * A small list of widely known advertising / analytics domains, used only to
 * label failed resource loads in diagnostics ("expected: ad or tracking resource").
 * It is not a blocklist and ShieldFix never blocks or unblocks anything with it.
 */
const AD_TRACKING_DOMAINS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googletagservices.com',
  'googletagmanager.com',
  'google-analytics.com',
  'googleadservices.com',
  'adservice.google.com',
  'imasdk.googleapis.com',
  'amazon-adsystem.com',
  'adnxs.com',
  'adsrvr.org',
  'criteo.com',
  'criteo.net',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'casalemedia.com',
  'taboola.com',
  'outbrain.com',
  'scorecardresearch.com',
  'quantserve.com',
  'moatads.com',
  'adsafeprotected.com',
  'doubleverify.com',
  'facebook.net',
  'connect.facebook.net',
  'hotjar.com',
  'segment.io',
  'segment.com',
  'mixpanel.com',
  'chartbeat.com',
  'chartbeat.net',
  'adform.net',
  'smartadserver.com',
  'yieldmo.com',
  'sharethrough.com',
  'teads.tv',
  'media.net',
  'bidswitch.net',
  'lijit.com',
  'sovrn.com',
  'indexww.com',
  'servedbyadbutler.com',
  'zedo.com',
  'propellerads.com',
  'popads.net',
  'adblockanalytics.com',
];

export function isAdTrackingHost(host: string): boolean {
  const h = host.toLowerCase();
  return AD_TRACKING_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}
