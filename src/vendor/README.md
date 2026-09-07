# Spine runtime

`spine-webgl.min.mjs` is the unchanged ESM distribution from
`@esotericsoftware/spine-webgl@4.3.10`, published by Esoteric Software:
https://registry.npmjs.org/@esotericsoftware/spine-webgl/-/spine-webgl-4.3.10.tgz

It includes the matching Spine core and supports the project's Spine 4.3.23
export. The license is retained in the distribution and in
`SPINE-RUNTIMES-LICENSE.txt`.

The archer uses WebGL for its connected mesh, then composites the result into
the main 2D canvas. Avoid switching it back to Canvas triangle rendering:
separately clipped triangles produce visible seams, and applying a Canvas
shadow to every triangle is especially expensive when the bow is fully drawn.

The earlier `spine-canvas.min.mjs` remains available for historical previews.
