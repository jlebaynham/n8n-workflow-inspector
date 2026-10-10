import asyncio, pathlib, tempfile
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
EXT = str(ROOT / "extension")
OUT = ROOT / "store"

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, channel="chromium",
            args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"], viewport={"width": 1280, "height": 800}, device_scale_factor=1, accept_downloads=True)
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event("serviceworker")
        ext_id = sw.url.split("/")[2]
        page = await ctx.new_page()
        await page.emulate_media(color_scheme="light", reduced_motion="reduce")
        url = f"chrome-extension://{ext_id}/inspector.html"

        # 1. Speed-to-lead, overview + start of the walkthrough
        await page.goto(url)
        await page.click(".paste summary")
        await page.fill("#paste", (ROOT / "test" / "speed-to-lead.json").read_text())
        await page.click("#paste-go")
        await page.wait_for_timeout(400)
        await page.evaluate("document.querySelector('.overview').scrollIntoView({block:'start'}); window.scrollBy(0,-18)")
        await page.wait_for_timeout(200)
        await page.screenshot(path=str(OUT / "screenshot-1-walkthrough.png"))

        # 2. Sample, steps + safety check side by side
        await page.goto(url)
        await page.click("#sample")
        await page.wait_for_timeout(400)
        await page.evaluate("document.querySelector('.cols').scrollIntoView({block:'start'}); window.scrollBy(0,-18)")
        await page.wait_for_timeout(200)
        await page.screenshot(path=str(OUT / "screenshot-2-safety-check.png"))

        # 3. Sample, clean copy made
        for opt in ("#opt-emails", "#opt-phones", "#opt-picks"):
            await page.check(opt)
        async with page.expect_download():
            await page.click("#download")
        await page.wait_for_timeout(300)
        await page.evaluate("document.querySelector('.clean').scrollIntoView({block:'end'}); window.scrollBy(0,40)")
        await page.wait_for_timeout(200)
        await page.screenshot(path=str(OUT / "screenshot-3-clean-copy.png"))

        # 4. Dark mode, the load screen
        await page.emulate_media(color_scheme="dark", reduced_motion="reduce")
        await page.goto(url)
        await page.click("#sample")
        await page.wait_for_timeout(300)
        await page.evaluate("window.scrollTo(0,0)")
        await page.screenshot(path=str(OUT / "screenshot-4-dark.png"))
        await ctx.close()

        # Promo tile 440x280
        b = await p.chromium.launch()
        icon = (ROOT / "tools" / "icon.svg").read_text()
        tile = await b.new_page(viewport={"width": 440, "height": 280})
        await tile.set_content(f"""
<html><body style="margin:0;width:440px;height:280px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
background:#f7f4ee;background-image:radial-gradient(rgba(20,20,20,.14) 1px,transparent 1px);background-size:18px 18px;display:flex;align-items:center;">
<div style="margin:0 26px;background:#fff;border:3px solid #141414;border-radius:18px;box-shadow:6px 6px 0 #141414;padding:22px 22px;display:flex;gap:18px;align-items:center;width:100%;box-sizing:border-box;">
  <div style="width:84px;height:84px;flex:none">{icon.replace('<svg ', '<svg width="84" height="84" ')}</div>
  <div>
    <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#fb5536;font-family:ui-monospace,Menlo,Consolas,monospace">For n8n workflows</div>
    <div style="font-size:29px;font-weight:800;line-height:1.05;color:#141414;margin:4px 0 8px">Workflow<br>Inspector</div>
    <div style="font-size:14px;line-height:1.35;color:#4a4740">Plain-English steps and a safety check before you share.</div>
  </div>
</div></body></html>""")
        await tile.screenshot(path=str(OUT / "promo-tile-440x280.png"))
        await b.close()

asyncio.run(main())
