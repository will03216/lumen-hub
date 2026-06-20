# Examples

Use this file for starter templates and compact working examples.

## Genre templates

### Product

`Glass perfume bottle on white marble. Slow orbit hero shot. Soft studio key with rear rim light. Macro depth-of-field. Clean background, no text.`

### Lifestyle

`A young woman pours coffee in a sunlit kitchen. Handheld phone perspective with slight sway. Warm morning light, candid and casual.`

### Drama

`A man [image1] walks through a narrow corridor holding a flashlight. Handheld follow from behind. The scene is quiet except for footsteps and breath.`

### Music video

`A singer [image1] performs to the track [audio1]. Neon warehouse stage. Quick camera bursts and cut rhythm aligned to the chorus. Strong magenta-blue palette.`

### Landscape

`Sweeping aerial over mountain ridges at dawn. Mist hangs in the valley. Slow pullback reveals scale. Cold blue shadows shifting to warm sunrise gold.`

### Commercial

`A black sports car moves along a mountain road at sunset. Low tracking camera beside the bodywork. Warm flare and restrained premium mood.`

### Stylized / anime

`White-haired warrior draws a glowing blade. Dynamic low-angle shot. Bold outlines, flat shading, high-contrast anime rendering, blue particle trail.`

## Short-drama templates (multi-asset, timeline)

Short dramas lean on character consistency + storyboard rhythm. Lead with an
asset/role declaration, then a per-beat timeline, then style + the portrait
constraint block. Keep one camera move + one action per beat; externalize
emotion as physical cues.

### Dialogue-heavy (dorm scene)

Assets: `[image1]` female lead (half body), `[image2]` dorm scene, `[video1]`
indoor dialogue camera ref, `[audio1]` room ambience.

> The girl [image1] is the lead; [image2] sets the dorm style; camera movement
> follows [video1]; ambience blends with [audio1].
>
> 0–5s:   Early evening. The girl [image1] walks briskly to the dorm door.
>         Medium shot, steady tracking. Warm sunlight spills down the corridor.
>         She pauses, takes a breath; lips press together, a flicker of nerves.
> 5–10s:  She pushes the door open. Cut to indoor medium shot. A roommate looks
>         up: "How'd the exam go? Did you pass?" Camera eases between half-body
>         close-ups.
> 10–15s: She lowers her head, shoulders dropping — close-up. Then looks up,
>         unable to hold back a grin: "Just kidding!" Camera slowly pulls back
>         to a wide shot of the laughing dorm.
>
> Warm tones, soft light, documentary feel. Stable face without deformation,
> normal proportions, natural fluid movement, no flicker, no stutter.

### Action / atmosphere-heavy (cliff duel)

Assets: `[image1]` red-robed lead, `[image2]` black-robed antagonist, `[image3]`
cliff bamboo forest, `[video1]` duel camera ref, `[audio1]` drums. Use `[video1]`
for camera/timing only.

> [image1] is the lead, [image2] the antagonist, scene from [image3]; camera and
> rhythm follow [video1] (camera only, not its characters); drums from [audio1].
>
> 0–5s:   Dusk. Slow push-in, side medium shot of the red-robed woman [image1]
>         at the cliff edge; robes sway in the wind; jaw set, gaze cold. A dark
>         figure [image2] is faint in the distant bamboo.
> 5–10s:  Focus-shift to a wide aerial. The two stand at opposite ends of the
>         cliff; wind whips dust. Rhythm lifts with the drums.
> 10–15s: Ground-level close-up. Both draw swords; the black-clad woman's [image2]
>         sword tip trembles. Camera follows as they circle, freezing on the
>         instant before the blades meet.
>
> Cool desaturated tones, misty wuxia texture, vintage film grain. Stable faces
> and body proportions, fluid movement, no stiffness, no stutter.

## Chinese prompt examples

### Product I2V

`镜头缓慢环绕香水瓶九十度，玻璃折射高光，柔和棚灯主光，标签保持清晰，背景纯净无文字。`

### Drama I2V

`她缓慢转身看向镜头，眼神从犹豫变得坚定。中景缓推到中近景，雨夜霓虹继续在身后反光。`

### Action with references

`角色A[image1]冲刺逼近角色B[image2]，B侧身闪开后反击。动作节奏与运镜参考[video1]。地面扬起灰尘，低角度跟拍。`

*(中文 prompt 也可用 `[图1]` / `[视频1]` / `[音频1]`，但同一段提示词只用一种语言风格。)*

## Template for fast drafting

```text
[reference if any]
[subject]
[single visible action]
[scene]
[single camera move]
[light or style anchor]
[optional sound or constraint]
```
