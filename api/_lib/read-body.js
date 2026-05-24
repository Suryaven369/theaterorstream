export async function readJsonBody(req) {
    if (req.body && typeof req.body === 'object' && !(req.body instanceof Buffer)) {
        return req.body;
    }
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => {
            if (!data) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}
