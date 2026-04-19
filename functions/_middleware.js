const CUSTOM_DOMAIN = 'bluecollartechy.com';
const PRODUCTION_PAGES_HOST = 'blue-collar-techy.pages.dev';

export const onRequest = async (context) => {
  const url = new URL(context.request.url);

  if (url.hostname === PRODUCTION_PAGES_HOST) {
    const target = 'https://' + CUSTOM_DOMAIN + url.pathname + url.search;
    return new Response(null, {
      status: 301,
      headers: {
        'Location': target,
        'Cache-Control': 'public, max-age=3600',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    });
  }

  if (url.hostname.endsWith('.pages.dev')) {
    if (url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n', {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Robots-Tag': 'noindex, nofollow, noarchive',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }
    const response = await context.next();
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return context.next();
};
