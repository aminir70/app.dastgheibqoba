/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        './public/index.html',
        './public/admin.html',
        './public/js/**/*.js',
    ],
    theme: {
        extend: {
            fontFamily: {
                vazir: ['Vazir', 'sans-serif'],
                shabnam: ['Shabnam', 'sans-serif'],
                tahoma: ['Tahoma', 'sans-serif'],
            },
            colors: {
                brand: {
                    50:  '#f0fdfa',
                    100: '#ccfbf1',
                    200: '#99f6e4',
                    300: '#5eead4',
                    400: '#2dd4bf',
                    500: '#14b8a6',
                    600: '#0d9488',
                    700: '#0f766e',
                    800: '#115e59',
                    900: '#134e4a',
                },
            },
        },
    },
    plugins: [],
    // arbitrary values like h-[calc(100vh-200px)] are scanned from content automatically
};
