import { NextRequest, NextResponse } from 'next/server';

const API_URL = 'https://microcred-api.onrender.com';

export async function GET(request: NextRequest) {
  return proxyRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
  return proxyRequest(request, 'POST');
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request, 'PATCH');
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request, 'DELETE');
}

async function proxyRequest(request: NextRequest, method: string) {
  try {
    // Get path from URL search params
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path') || '';
    
    console.log('[Proxy] Request:', { method, path, url: `${API_URL}${path}` });

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Forward Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      headers['Authorization'] = authHeader;
      console.log('[Proxy] Auth header forwarded:', authHeader.substring(0, 20) + '...');
    }

    const options: RequestInit = {
      method,
      headers,
      cache: 'no-store',
    };

    // Add body for POST/PATCH
    if (method === 'POST' || method === 'PATCH') {
      const body = await request.text();
      if (body) {
        options.body = body;
        console.log('[Proxy] Request body:', body);
      }
    }

    const response = await fetch(`${API_URL}${path}`, options);
    
    console.log('[Proxy] Response:', { 
      status: response.status, 
      statusText: response.statusText,
      contentType: response.headers.get('content-type')
    });

    // Get response body for logging
    const responseText = await response.text();
    console.log('[Proxy] Response body:', responseText);

    // Parse JSON if content-type is JSON
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      try {
        const data = JSON.parse(responseText);
        return NextResponse.json(data, { status: response.status });
      } catch (e) {
        console.error('[Proxy] Failed to parse JSON:', e);
        return new NextResponse(responseText, { status: response.status });
      }
    } else {
      return new NextResponse(responseText, { status: response.status });
    }
  } catch (error) {
    console.error('[Proxy] Error:', error);
    return NextResponse.json(
      { 
        detail: error instanceof Error ? error.message : 'Proxy request failed',
        error: 'Proxy error'
      },
      { status: 500 }
    );
  }
}
