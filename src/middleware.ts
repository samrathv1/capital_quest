import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  const pathname = request.nextUrl.pathname;

  // Protect administrative, volunteer, and coordinator routes
  const isAdminRoute = pathname.startsWith('/admin');
  const isVolunteerRoute = pathname.startsWith('/volunteer');
  const isCoordinatorRoute = pathname.startsWith('/coordinator');

  if (isAdminRoute || isVolunteerRoute || isCoordinatorRoute) {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(url);
    }

    // Query user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (!profile || !profile.is_active) {
      const url = request.nextUrl.clone();
      url.pathname = '/unauthorized';
      url.searchParams.set('reason', 'inactive_or_missing');
      return NextResponse.redirect(url);
    }

    const role = profile.role;

    if (isAdminRoute && !['super_admin', 'judge'].includes(role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/unauthorized';
      url.searchParams.set('required', 'super_admin');
      url.searchParams.set('current', role);
      return NextResponse.redirect(url);
    }

    if (isCoordinatorRoute && !['domain_coordinator', 'super_admin'].includes(role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/unauthorized';
      url.searchParams.set('required', 'domain_coordinator');
      url.searchParams.set('current', role);
      return NextResponse.redirect(url);
    }

    if (isVolunteerRoute && !['volunteer', 'domain_coordinator', 'super_admin'].includes(role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/unauthorized';
      url.searchParams.set('required', 'volunteer');
      url.searchParams.set('current', role);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/volunteer/:path*',
    '/coordinator/:path*',
  ],
};
