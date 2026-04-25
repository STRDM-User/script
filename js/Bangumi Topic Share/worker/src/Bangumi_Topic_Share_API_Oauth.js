export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return corsResp(null, 204);
        }

        const url = new URL(request.url);
        if (request.method === 'GET' && url.pathname === '/debug') {
            return jsonResp({
                ok: true,
                hasClientId: !!env.BGM_CLIENT_ID,
                hasClientSecret: !!env.BGM_CLIENT_SECRET,
                redirectUri: env.BGM_REDIRECT_URI || null,
            });
        }

        if (request.method !== 'POST') {
            return corsResp('Method Not Allowed', 405);
        }

        let body;
        try {
            body = await request.text();
        } catch {
            return corsResp('Bad Request', 400);
        }

        const params = new URLSearchParams(body);
        const grantType = params.get('grant_type');

        if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
            return corsResp('Invalid grant_type', 400);
        }

        const redirectUri = params.get('redirect_uri') || env.BGM_REDIRECT_URI;
        const tokenParams = new URLSearchParams({
            grant_type: grantType,
            client_id: env.BGM_CLIENT_ID || '',
            client_secret: env.BGM_CLIENT_SECRET || '',
            redirect_uri: redirectUri || '',
        });

        if (grantType === 'authorization_code') {
            const code = params.get('code');
            if (!code) return corsResp('Missing code', 400);
            tokenParams.set('code', code);
        } else {
            const refreshToken = params.get('refresh_token');
            if (!refreshToken) return corsResp('Missing refresh_token', 400);
            tokenParams.set('refresh_token', refreshToken);
        }

        const resp = await fetch('https://bgm.tv/oauth/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams.toString(),
        });

        const text = await resp.text();
        if (!resp.ok) {
            return jsonResp({
                ok: false,
                status: resp.status,
                bangumi: parseMaybeJson(text),
                hasClientId: !!env.BGM_CLIENT_ID,
                hasClientSecret: !!env.BGM_CLIENT_SECRET,
                redirectUri,
            }, resp.status);
        }

        return corsResp(text, resp.status, 'application/json');
    }
};

function parseMaybeJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function jsonResp(data, status = 200) {
    return corsResp(JSON.stringify(data, null, 2), status, 'application/json');
}

function corsResp(body, status = 200, contentType = 'text/plain') {
    return new Response(body, {
        status,
        headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}
