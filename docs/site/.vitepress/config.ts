import { defineConfig } from "vitepress";

const base = process.env.DOCS_BASE ?? "/lxi-web/";

export default defineConfig({
  title: "lxi-web",
  description: "Browser dashboard for LXI / SCPI-over-TCP instruments",
  base,
  lang: "en-US",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: "Manual", link: "/manual/" },
      { text: "Supported hardware", link: "/manual/supported-hardware" },
      { text: "Contributing", link: "/contributing/adding-a-driver" },
      { text: "Roadmap", link: "/manual/roadmap" },
      {
        text: "GitHub",
        link: "https://github.com/lxi-web/lxi-web",
      },
    ],
    sidebar: {
      "/manual/": [
        {
          text: "Manual",
          items: [
            { text: "Overview", link: "/manual/" },
            { text: "Installation", link: "/manual/installation" },
            { text: "Getting started", link: "/manual/getting-started" },
          ],
        },
        {
          text: "Device kinds",
          items: [
            { text: "Oscilloscope", link: "/manual/oscilloscope" },
            { text: "Power supply", link: "/manual/power-supply" },
            { text: "Multimeter", link: "/manual/multimeter" },
            { text: "Electronic load", link: "/manual/electronic-load" },
            { text: "Signal generator", link: "/manual/signal-generator" },
            { text: "Spectrum analyzer", link: "/manual/spectrum-analyzer" },
            { text: "Raw SCPI", link: "/manual/raw-scpi" },
          ],
        },
        {
          text: "Hardware",
          items: [
            { text: "Supported hardware", link: "/manual/supported-hardware" },
            { text: "Hardware reports", link: "/manual/hardware-reports" },
          ],
        },
        {
          text: "For developers",
          items: [
            { text: "Embed the core drivers", link: "/manual/embed-core" },
            {
              text: "Adding a driver",
              link: "/contributing/adding-a-driver",
            },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "Troubleshooting", link: "/manual/troubleshooting" },
            { text: "Roadmap", link: "/manual/roadmap" },
          ],
        },
      ],
      "/contributing/": [
        {
          text: "Contributing",
          items: [
            {
              text: "Adding a driver",
              link: "/contributing/adding-a-driver",
            },
          ],
        },
        {
          text: "Hardware",
          items: [
            { text: "Supported hardware", link: "/manual/supported-hardware" },
            { text: "Hardware reports", link: "/manual/hardware-reports" },
          ],
        },
      ],
    },
    search: {
      provider: "local",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/lxi-web/lxi-web" },
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © lxi-web contributors",
    },
  },
});
