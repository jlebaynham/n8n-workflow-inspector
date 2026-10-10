import asyncio, pathlib
from playwright.async_api import async_playwright
svg = pathlib.Path("icon.svg").read_text()
out = pathlib.Path("../extension/icons")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for size in (16, 32, 48, 128):
            pg = await b.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
            await pg.set_content(f'<html><body style="margin:0;background:transparent">{svg.replace("<svg ", f"<svg width=\'{size}\' height=\'{size}\' ")}</body></html>')
            await pg.screenshot(path=str(out / f"icon-{size}.png"), omit_background=True, clip={"x":0,"y":0,"width":size,"height":size})
            await pg.close()
        await b.close()
asyncio.run(main())
