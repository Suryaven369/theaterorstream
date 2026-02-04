export const convertImageToBase64 = async (imageUrl) => {
    if (!imageUrl) return null;

    try {
        const response = await fetch(imageUrl, {
            mode: 'cors', // TMDB allows CORS
            cache: 'force-cache'
        });

        if (!response.ok) throw new Error('Failed to fetch image');

        const blob = await response.blob();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn('Image conversion failed:', error);
        return null;
    }
};

// Helper to determine optimized image source
export const getOptimizedImage = (path, base64, baseUrl) => {
    if (base64 && base64.startsWith('data:image')) {
        return base64;
    }
    if (path) {
        return baseUrl + path;
    }
    return null; // or placeholder
};
