/** @type {import('tailwindcss').Config} */
module.exports = {
    // NOTE: Update this to include the paths to all files that contain Nativewind classes.
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
            colors: {
                background: "rgb(var(--color-background-rgb) / <alpha-value>)",
                text: "rgb(var(--color-text-rgb) / <alpha-value>)",
                primary: "rgb(var(--color-primary-rgb) / <alpha-value>)",
                secondary: "rgb(var(--color-secondary-rgb) / <alpha-value>)",
                border: "rgb(var(--color-border-rgb) / <alpha-value>)",
                card: "rgb(var(--color-card-rgb) / <alpha-value>)",
                menu: "rgb(var(--color-menu-rgb) / <alpha-value>)",
                accent: "rgb(var(--color-accent-rgb) / <alpha-value>)",
                error: "rgb(var(--color-error-rgb) / <alpha-value>)",
                success: "rgb(var(--color-success-rgb) / <alpha-value>)",
                tabActive: "rgb(var(--color-tab-active-rgb) / <alpha-value>)",
                tabInactive: "rgb(var(--color-tab-inactive-rgb) / <alpha-value>)",
                playerBackground: "rgb(var(--color-player-background-rgb) / <alpha-value>)",
            }
        },
    },
    plugins: [],
};
