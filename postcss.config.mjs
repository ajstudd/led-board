const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-lightningcss": {
      browsers: ">= 0.5%, Firefox >= 95",
      lightningcssOptions: {
        drafts: {
          customMedia: true,
        },
      },
    },
  },
};

export default config;
