/** @type {import('tailwindcss').Config} */
module.exports = {
    // NOTE: Update this to include the paths to all files that contain Nativewind classes.
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
            colors: {
                background: "var(--color-background)",
                foreground: "var(--color-text)",
                primary: "var(--color-primary)",
                secondary: "var(--color-secondary)",
                border: "var(--color-border)",
                card: "var(--color-card)",
                accent: "var(--color-accent)",
                error: "var(--color-error)",
                success: "var(--color-success)",
                tabActive: "var(--color-tab-active)",
                tabInactive: "var(--color-tab-inactive)",
            }
        },
    },
    plugins: [],
};
