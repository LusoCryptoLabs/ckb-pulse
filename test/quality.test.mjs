// The scene works less on a device that draws in software, and not on one that has a GPU.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { softwareRenderer } from '../public/quality.js'

test('software renderers are recognised', () => {
  for (const n of [
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)', 'Mesa softpipe', 'Microsoft Basic Render Driver', 'Google SwiftShader', 'Software Rasterizer',
  ]) assert.ok(softwareRenderer(n), n)
})

test('real GPUs are not', () => {
  for (const n of [
    'ANGLE (AMD, AMD Radeon RX 7900 XTX (0x0000744C) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Apple M2', 'Mesa Intel(R) Xe Graphics (TGL GT2)', 'Adreno (TM) 650', '', null, undefined,
  ]) assert.ok(!softwareRenderer(n), String(n))
})
