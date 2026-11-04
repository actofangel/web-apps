# KOYO — Leaf morphology data and asset candidates

Survey date: 2026-09-26

## Findings

None of the public data reviewed provides a complete set of per-species Three.js 3D meshes that could be used directly for KOYO's 14 varieties. What is publicly available is mainly morphological descriptions and measurements of leaves, 2D photographs and masks, contour extraction tools, and vein annotations for other species.

In Three.js, the basic blade shape and lobes are built from a per-species morphology recipe, and the margin, petiole, veins, blade curvature and material are assembled separately. Public data serves as the basis for those recipes and as visual reference. Raw photographs are not bundled with the app until their licenses have been confirmed.

## How 3D shapes are currently handled

The Three.js leaf blades are generated from per-species morphology recipes. Oaks are built from rounded lobes arranged pinnately, maples from palmate lobes, and Ginkgo as a fan with a central notch; the other species are shaped from an outline profile, asymmetry and marginal serration. Each tooth of a serrated margin gets its own amplitude, and for maples the lobe width and sinus depth are set separately to distinguish the deep sinuses of Silver Maple, the rounded form of Sugar Maple and the narrow star of Sweetgum. A very slight individual variation is added to the outline, the generated outline is meshed, and blade curvature, fine surface relief, veins and transmitted light at the margin are layered on top. The original app's `bladePath` is kept for the SVG fallback and small previews, and has not been ported into the Three.js leaf generator.

The morphology recipes used here are hand-tuned parameters inside the app, not 3D assets measured from real specimens. plant-traits contains morphological descriptions drawn from the literature and does not provide outline coordinates. This change is a rendering model that uses user-provided specimen photographs of each species for visual comparison, strengthening the natural differences in maple lobes and outlines. The photographs themselves are not reproduced as textures, and the per-species shapes have not been replaced with verified measured data. If images or masks from Leafsnap or similar sources are later used as shape or material references, the species, specimen ID, processing steps and reuse terms will be recorded, and distribution terms confirmed before anything is bundled.

## User photo backdrops and screenshots

Two autumn images created by the user (with the author's watermark) are bundled with the app as `default-wallpaper.jpg` and `default-wallpaper-2.jpg`. The image data is loaded into the HTML as data URLs, so the backdrop can still be read back when saving the canvas even when the single HTML file is opened from `file://`. The first image loads at startup but is shown only while the Motion tab is selected. "Default Wallpaper 1" and "Default Wallpaper 2" switch between the two, and "Clear Image" removes the backdrop. Choosing another image shows it as the backdrop for that session; the image is never sent anywhere.

The framing (fill the stage or show the whole image), brightness and opacity can be adjusted. Saving a falling scene downloads a PNG that composites the photo, the sunlight layer and the leaves or petals at that moment. PNG export keeps the Three.js drawing buffer so the leaves can be read back, and falls back to a data URL where `toBlob` is unavailable or a PNG blob cannot be created.

"Record Video (WebM)" saves the composited preview (backdrop, sunlight and moving leaves or petals) as WebM at 30 fps without audio. The video dimensions are the pixel dimensions of the preview canvas when recording starts, independent of the PNG still output size. The codec is chosen in the order VP9, VP8, then WebM default, depending on support. Recording depends on the browser's support for `MediaRecorder`, `canvas.captureStream()` and WebM codecs. Photo files chosen by the user are never saved into the app itself or into the JSON state file. Whether HEIC/HEIF and similar formats can be loaded depends on the browser's image support.

Several of the 14 varieties can be selected as falling leaves. The number of leaves can be set from 4 to 56, and wind direction, wind strength, fall speed and flutter strength can be controlled. While falling, the Three.js leaves rotate continuously so that the front and back faces alternate. "Motion-only view" hides the control panels, playback bar and helper overlays during playback and shows only the photo and the falling leaves, filling the screen. Esc returns to the normal controls while playback continues.

The translucency of thin blades is set with "Leaf translucency". Turning "Backlit glow" off stops the warm, angle-dependent scattering and glow, and "Glow strength" sets its intensity; the default is a restrained 24%. The leaf surface shader varies the strength of transmitted light from the rotating surface normal and the direction of the light behind, adding light only when a leaf turns toward the backlit side. "Sunlight strength" sets the overall backlight, and when sync is on, the light level also pulses with the wind gusts. This scattering and glow is a shader effect for showing thin leaves; it does not reproduce measured optical properties of leaves or a post-processing bloom.

### Backdrop light source position

Pressing "Move light source on scene" under "Autumn Sunlight" in the Motion tab shows a light source marker on the stage. Click or drag on the image to move it, then press "Done positioning light" to confirm. The position is stored as a fraction of the stage width and height, and is applied to the broad sunlight gradient on the backdrop and to the direction of the Three.js DirectionalLight. This light source is a staging effect on screen; it does not model distance falloff or reproduce the real lighting position estimated from the photo. PNG export uses the same position, and the coordinates are included in the JSON state file.

### Vanishing points and virtual perspective on the image

After loading a photo in Photo Backdrop, choose a one-point or two-point perspective model under "Virtual Perspective", press "Place / move points" and click the visible stage. In two-point mode the first click sets VP1 and the second sets VP2. Further clicks move the nearest point, and the markers can also be dragged. "Perspective strength" adjusts the effect.

Each floating item is given a virtual depth: the farther back it is, the smaller it is drawn and the closer its screen position is pulled toward the chosen vanishing point. In two-point mode items are split between the two directions, with convergence toward each point. In Three.js rendering a depth-dependent Z position is added as well. This is a screen-space perspective effect that makes leaves and petals overlaid on an uploaded image look right. It is not a calibration that recovers the camera position or real-world scale from the photo, a 3D reconstruction of the ground or buildings, or a projective transformation. The vanishing points are stored in normalized coordinates of the visible stage and keep their position when the screen size changes. They are cleared when a new photo is loaded. Saved PNGs include the projected leaves or petals but not the guide lines or handles.

Placing a vanishing point temporarily shows a perspective grid and the points, indicating the orientation of the virtual space. About 4.8 seconds after placing or moving a point, the display fades out. The vanishing point coordinates and the perspective effect on the leaves are kept after the guide fades, and pressing "Place / move points" shows them again for editing. "Clear points" removes both the coordinates and the perspective effect.

## Regional falling-leaf presets

- **Japan · Ginkgo** selects Ginkgo only. The Tokyo Metropolitan Government's TOKYO GREEN BIZ MAP describes ginkgo as a deciduous tree that turns yellow in autumn and as the most widely planted street tree on metropolitan roads. This preset is one example of Tokyo's street trees. It does not represent the vegetation of Japan as a whole, or all of Japan's autumn-color trees.
- **Paris · Maple + Ginkgo** selects Ginkgo and the 'Crimson King' Norway maple (*Acer platanoides*). The City of Paris tree species guide states that Norway maple makes up more than 2% of the trees managed by the city, mainly in street tree rows and cemeteries, and lists 'Crimson King' among the cultivars used in Paris. The city's park guide notes that ginkgo suits the urban environment and is planted as a street tree.
- Plane trees, which are especially common in Paris, are not among the current 14 varieties, so this is not a comprehensive preset of Paris street trees. The combination shown is a regional example chosen from the species in this collection.
- Changing a checkbox switches the regional preset display to a custom selection. **All** returns to all 14 varieties.

Sources: [Tokyo Metropolitan Government, TOKYO GREEN BIZ MAP — Ginkgo](https://www.tokyo-greenbizmap.metro.tokyo.lg.jp/tree/tree_detail02/); [City of Paris — *Acer platanoides* species sheet](https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/fiches-essences-du-guide-des-essences-de-paris/files/89d241ac1c8307272bb70852187ffb22); [City of Paris — Biodiversity trail at Parc Montsouris](https://www.paris.fr/pages/parcours-au-parc-montsouris-4020); [City of Paris — A walk among the trees in the heart of Paris](https://www.paris.fr/pages/promenez-vous-parmi-les-arbres-au-coeur-de-paris-20627).

## Flower petal drift mode

"Flower Petals" in the Motion tab switches between falling leaves and petals. Petals combine four outlines (cherry, rose, camellia and cosmos) with colors chosen from pink, ivory, red, yellow and purple. Wind, fall speed, perspective, the backdrop image, backlight, full-screen display and PNG saving are shared with leaf mode. Petals have no veins or petioles and are generated as thin surfaces smaller than leaves. In Three.js, a dense surface mesh is given soft color variation and a satin sheen, so the backdrop shows through while the bright colors are kept. The backlit glow follows the chosen petal color and can be turned off. The number of petals can be set from 24 to 260, with a default of 144. Falling leaves range from 4 to 56 (default 28). The SVG fallback drops the dark leaf shadow and draws the bright colors and backlit glow.

The attached Stockcake image is used as a visual reference for the volume, color and drift of the petals. Neither that image nor any stock material is copied into the app; petal shapes are generated from hand-tuned parameters inside the app. These are not 3D assets measured from flower cultivars.

## Morphology data on GitHub

### Natural History Museum — plant-traits

The [repository](https://github.com/NaturalHistoryMuseum/plant-traits) publishes morphological data extracted from plant descriptions in sources such as the Biodiversity Heritage Library, eFloras and EcoFlora. The repository's license file is CC BY 4.0. It includes per-species leaf shape, apex, base, margin, and leaf length and width. KOYO's attribution is "Natural History Museum, plant-traits dataset, CC BY 4.0", with the modification recorded as "Adjusted the Sugar Maple margin parameters to match the description of an undulate, entire margin".

This data was used to check the current leaf shape profiles. For example, *Betula pendula* is described as triangular, ovate or rhombic with a serrate margin; *Populus tremuloides* as orbicular, cordate or ovate with a crenate margin; *Ulmus americana* as oblong, ovate and similar with a serrate margin; *Acer rubrum* as palmate and lobed; and *Liquidambar styraciflua* as palmate and lobed with a dentate margin. The Sugar Maple margin was also matched to its description as "undulate, entire", softening the fine serration of the procedural mesh. Because this is a compilation of literature descriptions, it does not directly provide outline coordinates or average shapes of individual specimens.

The repository's measurement CSV derived from specimen images covers 14,533 specimens, with columns for length, width, perimeter and area. However, the identifiers in the CSV are specimen sheets and leaf numbers, with no species names. Without matching them to species, the values cannot be carried over directly to KOYO's dimensions.

### Contour extraction tool

[maple60/leaf-contour-efd](https://github.com/maple60/leaf-contour-efd) is a tool that extracts outlines from leaf images and saves outline coordinates and elliptic Fourier descriptors to CSV/JSON. The software is licensed under BSD-3-Clause. It is a processing tool and does not contain photographs of KOYO's species.

### Vein annotations

[HALVS-Hierarchical-Vein-Segment](https://github.com/WeizhenLiuBioinform/HALVS-Hierarchical-Vein-Segment) provides pixel annotations of primary, secondary and tertiary veins for 5,057 leaves of soybean, cherry and London plane. Its species barely overlap with KOYO's. Obtaining the full dataset requires a signed data use agreement.

## Leaf photographs and masks

The [official Leafsnap dataset](https://leafsnap.com/dataset/) is hosted outside GitHub but covers a wide range of North American tree species close to KOYO's. According to its page, it contains 23,147 lab images of pressed leaves (front-lit and back-lit) and 7,719 field images; the full set, including original images and automatic segmentations, is 977 MB.

Coverage of the current 14 varieties is as follows. Image counts are the sum of the lab and field images for the matching species on the official page.

| KOYO leaf | Related or matching species in Leafsnap | Images | Match |
|---|---|---:|---|
| Birch | Betula populifolia | 146 | Related species, not the *Betula pendula* named in KOYO |
| Aspen | Populus tremuloides | 161 | Same species |
| Poplar | Populus deltoides | 166 | Same species |
| Elm | Ulmus americana | 215 | Same species |
| Ginkgo | Ginkgo biloba | 141 | Same species |
| Silver Maple | Acer saccharinum | 187 | Same species |
| Sugar Maple | Acer saccharum | 183 | Same species |
| White Oak | Quercus alba | 175 | Same species |
| Northern Red Oak | Quercus rubra | 71 | Same species |
| Red Maple | Acer rubrum | 297 | Same species |
| Autumn Brilliance Serviceberry | Amelanchier arborea / canadensis / laevis | 131 / 155 / 151 | Related species, not the hybrid cultivar itself |
| Sweetgum | Liquidambar styraciflua | 166 | Same species |
| Black Gum | Nyssa sylvatica | 164 | Same species |
| Crimson King Maple | Acer platanoides | 140 | Parent species, not the 'Crimson King' cultivar itself |

Within the scope of this survey, no explicit reuse license could be found on Leafsnap's public pages. The rights terms must be confirmed before any images or masks are copied into or bundled with KOYO. For now they are treated as candidates for species identification and shape checking, and no raw images are included in the app.

## Usage policy for KOYO

- Use the CC BY plant-traits data as a secondary check of outlines, margins and leaf shape classes, and keep the attribution.
- Treat Leafsnap as a candidate for checking the outlines and vein shapes of the same species or of clearly stated related species. Do not bundle images or masks before the rights are confirmed.
- Once outline coordinates derived from Leafsnap are used in the generated meshes, record the source species, specimen ID, processing method and license terms. Distinguish proxy shapes from related species or cultivars within the app as well.
- For 3D, turn the 2D outline into a dense mesh, and treat vein patterns, gentle blade curvature, transmitted light and seasonal color as separate parameters.

## Main sources

- Natural History Museum, [plant-traits GitHub repository](https://github.com/NaturalHistoryMuseum/plant-traits) — data license and morphology fields.
- [CC BY 4.0 license text](https://creativecommons.org/licenses/by/4.0/).
- Kumar et al., [Leafsnap dataset](https://leafsnap.com/dataset/) — image counts per species, image formats and segmentation.
- [LeafContourEFD GitHub repository](https://github.com/maple60/leaf-contour-efd) — contour extraction tool and license.
- [HALVS GitHub repository](https://github.com/WeizhenLiuBioinform/HALVS-Hierarchical-Vein-Segment) — species and access terms for the vein annotations.


## Leaf shape data traced from reference images

### Source and handling

The outlines, veins, petioles and leaf colors were read from reference images of the 14 leaves, collected from freely available sources to capture each leaf's shape accurately. The images themselves are not bundled with the app and are not used as textures. The app contains only the coordinates and color values derived from them (`LEAF_TRACE` in index.html).

Each reference leaf is a single specimen, not the average shape of its species. The individual variation of each specimen remains in its shape.

### Processing

1. The leaves were separated from the background by color difference. Leaves that touched each other were split into 14 using a watershed on the color gradient, plus hand-drawn cuts where they overlapped.
2. For each leaf, the axis from base to apex was found to align its orientation, and the axis position was set by a left-right symmetry search. Edges hidden under other leaves were filled in by mirroring across the axis (the filled area is a few percent for the maples, and up to about 10% for Sugar Maple and Sweetgum). For Ginkgo, the central notch appears only as a thin line in the reference image, so it was restored by hand.
3. Each outline was resampled to 440 evenly spaced points and stored in coordinates where the leaf length is 1. The leaf width comes from the aspect ratio in the reference image.
4. The petiole was extracted from each cut-out leaf by following its narrow part along a shortest path.
5. For the veins, the vein topology was specified per species (midrib, number and angle of secondary veins, and primary veins running to the lobe tips), and the actual paths were drawn as shortest paths following the vein positions in the reference image. The fine reticulate veins cannot be traced at the reference image's resolution, so they are represented by a mesh generated in the texture. For leaves whose veins are hard to see, such as Aspen, Poplar and Ginkgo, the specified structure carries more weight.
6. Colors were taken as representative blade colors, excluding veins and margins, at three places on each leaf: toward the apex, in the middle and toward the base. These three colors are used as each species' peakAutumn (peak color). The colors for the other seasons are unchanged. The vein color is set from the ratio between vein and blade color in the reference image (veinTone).

### Blade surface model

The height of the blade surface is computed by bladeZ (tracedBladeZ for leaves traced from the reference image), and the blade mesh and the vein tubes share the same surface. Undulation that bulges between veins and forms valleys along them is built from a distance-to-vein field. On top of this are a margin wave depending on distance to the edge and a droop at the apex. The blades of traced leaves are uniform meshes that join the outline and an interior grid by Delaunay triangulation, with a resolution of about 1/62 of the leaf length. Height, UV and edge effects are all smooth functions of position (x, y) and do not depend on the blade width of each row (to avoid steps in deeply lobed leaves).

Where no data from the reference image is available, generation falls back to the earlier hand-tuned parameters.

### Known limitations

- The height (curvature and bulging) is not measured from the reference image; it is an expressive parameter.
- The filled-in edges and veins hidden in the reference image are estimates based on an assumption of left-right symmetry.
- Each leaf's color is that of a single specimen.

### Bug fixed

When the seasonal progression went past 66%, the apex color was computed "from late color to late color" instead of "from peak color to late color", so the color jumped at that boundary. It now interpolates from peak color to late color.


## Leaf tissue texture and per-leaf variation

Both are expressive parameters for appearance, not values measured from photographs. The per-species strengths are collected in `LEAF_VARIATION` in index.html.

### Leaf tissue texture

- Green remaining along the veins (halo map): a per-species map built from distance to the veins. Its effect follows the season, strong in early autumn and fading as the season advances. It is strong for the maples and Sweetgum and not applied to Ginkgo.
- Fine reticulate veinlets: the fine mesh between veins is overlaid as slightly darker lines.
- Mottling, warm and cool unevenness, dark spots, insect holes and browned margins: generated from a single seamless tile shared by all species. Spot density and hole area are set per leaf, and the hole value is the area fraction itself (0.02 means about 2% of the blade). The edges of the holes are darkened.
- The tile's sampling position and rotation differ per leaf, so the same tile gives different patterns.

### Per-leaf variation (falling leaves)

Falling leaves share one shape per species, but each leaf gets its own material, varying the following values.

- Shape: width-to-length ratio, left-right asymmetry, curvature of the midrib, fold along the midrib, twist, curl at the apex, and size differences between lobes. The same deformation is applied to the blade, veins and petiole, so they move together as one leaf.
- Color: ripeness per leaf (±7.5 points of seasonal progression), variation in brightness, and whether and how strongly the margin browns.
- Texture: spot density, insect holes (only about 20% of leaves) and the intensity of the green along the veins.

The leaves on the composition canvas keep the standard shape without individual variation.

### Known limitations

- Variation deforms the whole leaf rather than rebuilding its outline. The serration of the margin and the number of lobes do not change.
- Normals after deformation are approximate, so shading can be slightly off when the fold or twist is large.
- Color variation is approximated by multiplying the whole leaf by a color.

## Bugs fixed during code review (2026-11-05)

- The Motion tab had a duplicated "Falling Leaf Varieties" section, with two sets of the same IDs. The second section's All, Clear and variety list did not work, so it was removed.
- In automatic season cycling, progression stopped at speed 1 and stalled on the way back at speed 2 (because it was rounded to an integer each time). Progression is now kept as a fraction and only the display is rounded.
- The rotation speed of falling leaves and petals depended on the screen refresh rate (twice as fast at 120 Hz as at 60 Hz). It is now proportional to elapsed time.
- Fixed the condition that kept the default wallpaper load failure message from being shown.
- During dragging, rotating, scaling and layout transition animations, the vertex colors of all 14 leaves and the collection list were rebuilt every time. Color recalculation is now skipped for operations that only change position.
- Fixed sliders, label toggles and wreath orientation buttons getting out of sync with the state after Reset All and JSON restore. Layout jitter (layoutJitter) is now also saved to JSON, and values are validated on restore. The same JSON can now be loaded several times in a row.
- Cmd+S and Ctrl+S were triggering Shuffle, so input with modifier keys and input on select boxes is now ignored. The F key now does the same as the "Fit View" button (including resetting zoom and position). Esc also ends vanishing point editing.
- Individual resets now also reset the rotation and scale targets. Fixed an invalid CSS filter value during dragging. The initial speed label now matches the format shown after moving the slider.
