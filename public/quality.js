// Is this WebGL renderer software, a GPU emulated on the processor? Then the scene draws without the bloom, at pixel
// ratio 1, and holds still between events (see pulse3d.js). The name comes from WEBGL_debug_renderer_info.
export const softwareRenderer = (name) => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(name || ''))
