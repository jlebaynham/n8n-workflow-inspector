import asyncio, json, pathlib, sys, tempfile
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXT = str(ROOT / "extension")
OUT = ROOT / "test" / "out"
OUT.mkdir(exist_ok=True)

async def main():
    errors = []
    async with async_playwright() as p:
        user = tempfile.mkdtemp()
        ctx = await p.chromium.launch_persistent_context(user, headless=True, channel="chromium", args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"], accept_downloads=True, viewport={"width": 1280, "height": 900})
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event("serviceworker", timeout=15000)
        ext_id = sw.url.split("/")[2]
        print("extension id", ext_id)
        await asyncio.sleep(1.5)
        opened = [pg.url for pg in ctx.pages]
        print("tabs after install:", opened)
        assert any(u.endswith("/inspector.html") for u in opened), "install did not open the inspector"
        page = next(pg for pg in ctx.pages if pg.url.endswith("/inspector.html"))
        page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        requests = []
        page.on("request", lambda r: requests.append(r.url))
        await page.reload()
        await page.wait_for_load_state("networkidle")

        # 1. Sample
        await page.click("#sample")
        await page.wait_for_selector("#results:not([hidden])")
        title = await page.text_content("#ov-title")
        steps = await page.locator(".step").count()
        verdict = await page.text_content("#verdict")
        print("sample:", title, "| steps", steps, "|", verdict)
        assert steps == 7, steps
        assert "Don't share" in verdict
        await page.screenshot(path=str(OUT / "sample-full.png"), full_page=True)

        # 2. Planted file via file input
        await page.set_input_files("#file", str(OUT / "planted.json"))
        await page.wait_for_function("document.querySelector('#ov-title').textContent === 'Planted test'")
        findings = await page.locator(".finding").count()
        unconnected = await page.locator("#unconnected li").count()
        print("planted findings:", findings, "unconnected:", unconnected)
        assert findings >= 25 and unconnected == 1
        body = await page.inner_text("body")
        for secret_piece in ["Sup3rS3cret", "hunter2hunter2", "abcDEF1234567890ghi", "q8w7e6r5t4y3u2i1"]:
            assert secret_piece not in body, f"secret shown on page: {secret_piece}"

        # 3. Clean copy download with all options
        for opt in ("#opt-emails", "#opt-phones", "#opt-picks"):
            await page.check(opt)
        async with page.expect_download() as dl_info:
            await page.click("#download")
        dl = await dl_info.value
        path = OUT / dl.suggested_filename
        await dl.save_as(str(path))
        clean = json.loads(path.read_text())
        print("downloaded", dl.suggested_filename, len(clean["nodes"]), "nodes")
        changes = await page.locator("#changes li").all_inner_texts()
        left = await page.locator("#left li").all_inner_texts()
        print("changes:", changes)
        print("left:", left)
        assert dl.suggested_filename == "planted-test-clean.json"
        assert "Sup3rS3cret" not in path.read_text()

        # 4. Re-inspect the clean copy
        await page.set_input_files("#file", str(path))
        await page.wait_for_timeout(500)
        print("clean verdict:", await page.text_content("#verdict"))

        # 5. Paste flow + bad JSON
        await page.click(".paste summary")
        await page.fill("#paste", "{not json")
        await page.click("#paste-go")
        err = await page.text_content("#error")
        assert "isn't valid JSON" in err, err
        await page.fill("#paste", json.dumps({"hello": 1}))
        await page.click("#paste-go")
        err = await page.text_content("#error")
        assert "doesn't look like an n8n workflow" in err, err
        await page.fill("#paste", (ROOT / "test" / "speed-to-lead.json").read_text())
        await page.click("#paste-go")
        await page.wait_for_function("document.querySelector('#ov-title').textContent.startsWith('Speed-to-lead')")
        print("speed-to-lead verdict:", await page.text_content("#verdict"), "| steps", await page.locator(".step").count())
        await page.screenshot(path=str(OUT / "speed-full.png"), full_page=True)

        # 6. Copy to clipboard
        pass
        await page.click("#copy")
        await page.wait_for_selector("#copied:not([hidden])")
        print("copy msg:", await page.text_content("#copied"))

        # 7. XSS check: a node name with HTML
        evil = {"name": "<img src=x onerror=alert(1)>", "nodes": [{"name": "<script>window.pwned=1</script>", "type": "n8n-nodes-base.manualTrigger", "parameters": {}, "position": [0, 0]}], "connections": {}}
        await page.fill("#paste", json.dumps(evil))
        await page.click("#paste-go")
        await page.wait_for_timeout(300)
        pwned = await page.evaluate("window.pwned === 1 || document.querySelectorAll('#results img, #results script').length")
        assert not pwned, "HTML from the workflow was rendered"
        print("xss safe:", await page.text_content("#ov-title"))

        # 8. Mobile and dark mode
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.click("#sample")
        await page.wait_for_timeout(300)
        overflow = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
        print("mobile horizontal overflow:", overflow)
        await page.screenshot(path=str(OUT / "mobile.png"), full_page=True)
        await page.emulate_media(color_scheme="dark")
        await page.set_viewport_size({"width": 1280, "height": 900})
        await page.wait_for_timeout(200)
        await page.screenshot(path=str(OUT / "dark.png"), full_page=False)

        ext_requests = [r for r in requests if not r.startswith("chrome-extension://") and not r.startswith("data:") and not r.startswith("blob:")]
        print("outside requests:", ext_requests)
        assert not ext_requests
        await ctx.close()
    print("ERRORS:", errors)
    assert not [e for e in errors if "error" in e.lower()], errors
    print("BROWSER TESTS PASS")

asyncio.run(main())
