/**
 * Motion primitives.
 *
 * `CountUp`, `GlareHover` and `ShinyText` come from ReactBits, pulled through
 * the `reactbits` MCP server configured in `.mcp.json` and ported from
 * TypeScript + Tailwind to this project's JavaScript + MUI `sx`. `Reveal`
 * reimplements ReactBits' `animated-content` on framer-motion rather than
 * adding gsap for it. Each file notes what changed and why.
 */
export { default as CountUp } from './CountUp';
export { default as Reveal } from './Reveal';
export { default as GlareHover } from './GlareHover';
export { default as ShinyText } from './ShinyText';
