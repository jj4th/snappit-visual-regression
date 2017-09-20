import * as childProcess from "child_process";

import {expect} from "chai";
import * as fs from "fs-extra";
import * as _ from "lodash";
import {By, ISize, ThenableWebDriver, WebDriver} from "selenium-webdriver";

import {IConfig} from "../src/config";
import {
    Screenshot,
    ScreenshotMismatchException,
    ScreenshotNotPresentException,
    ScreenshotSizeException,
} from "../src/screenshot";
import {$, NoDriverSessionException, snap, Snappit} from "../src/snappit";

function sameAsReference(
    name: string,
): boolean {
    const fromPath = `./test/screenshots/${name}`;
    const toPath = `./test/screenshots/reference/${name}`;
    const fromSha: Buffer = fs.readFileSync(fromPath);
    const toSha: Buffer = fs.readFileSync(toPath);
    return fromSha.compare(toSha) === 0;
}

async function setViewportSize(
    driver: ThenableWebDriver,
    size: ISize,
): Promise<void> {
    const jsGetPadding: string = `return {
        width: window.outerWidth - window.innerWidth,
        height: window.outerHeight - window.innerHeight
    }`;

    const padding: ISize = await driver.executeScript(jsGetPadding) as ISize;
    return driver.manage().window().setSize(
        size.width + padding.width,
        size.height + padding.height,
    );
}

function browserTest(
    name: string,
    config: IConfig,
    driver?: ThenableWebDriver,
    skip?: boolean,
): void {
    const suiteFn = skip ? describe.skip : describe;

    suiteFn(name, function() {
        let snappit: Snappit;
        this.timeout(15000);
        this.slow(2500);

        before(() => {
            snappit = new Snappit(config, driver);
        });

        if (!driver) {
            it("should create a driver instance", async () => {
                // Snappit will throw if there is a problem in driver creation.
                driver = snappit.start();
                await driver;
            });
        } else {
            driver = driver as ThenableWebDriver;
        }

        it("should navigate to the localhost page", async () => {
            // Cast here as TypeScript thinks driver might not be initialized.
            driver.get("http://localhost:8080/");

            expect(await $("#color-div").isDisplayed()).to.eql(true);
        });

        it("should terminate the driver instances", async () => {
            await snappit.stop();
        });
    });
}

// This namespace is just used for declaration merging convenience for .skip
/* tslint:disable-next-line:no-namespace */
namespace browserTest {
    export function skip(
        name: string,
        config: IConfig,
        driver?: ThenableWebDriver,
    ): void {
        browserTest(name, config, driver, true);
    }
}

describe("Snappit", () => {

    describe("with useDirect set", () => {

        browserTest("Chrome", {
            browser: "chrome",
            useDirect: true,
        });

        browserTest.skip("Legacy FireFox", {
            browser: "firefox",
            useDirect: true,
            useGeckoDriver: false,
        });

        browserTest("GeckoDriver FireFox", {
            browser: "firefox",
            useDirect: true,
            useGeckoDriver: true,
        });

    });

    // Using the default server URL
    describe("when using a remote server", () => {

        browserTest("Chrome", {
            browser: "chrome",
            serverUrl: "http://localhost:4444/wd/hub",
            useDirect: false,
        });

        browserTest.skip("Legacy FireFox", {
            browser: "firefox",
            serverUrl: "http://localhost:4444/wd/hub",
            useDirect: false,
            useGeckoDriver: false,
        });

        browserTest("GeckoDriver FireFox", {
            browser: "firefox",
            serverUrl: "http://localhost:4444/wd/hub",
            useDirect: false,
            useGeckoDriver: true,
        });

    });

    describe("$ and snap shorthand methods", function() {
        let snappit: Snappit;
        let driver: ThenableWebDriver;
        this.timeout(15000);
        this.slow(2500);

        before(() => {
            // Reset reference images

            // Initialize Snappit
            const config: IConfig = {
                browser: "chrome",
                screenshotsDir: "test/screenshots",
                threshold: 0.1,
                useDirect: true,
            };

            snappit = new Snappit(config);
        });

        describe("before 'snappit.start()", () => {
            it("should throw an error on invoking '$'", () => {
                const fn = $ as () => any;
                expect(fn).to.throw(NoDriverSessionException);
            });

            it("should throw an error on invoking 'snap'", async () => {
                const fn = snap as () => Promise<void>;
                const error = await fn().catch((err) => err);
                expect (error).to.be.an.instanceOf(NoDriverSessionException);
            });
        });

        describe("after 'snappit.stop()", () => {
            before(async () => {
                driver = snappit.start();
                await driver.get("http://localhost:8080/");
                await snappit.stop();
            });

            it("should throw an error on invoking '$'", () => {
                const fn = $ as () => any;
                expect(fn).to.throw(NoDriverSessionException);
            });

            it("should throw an error on invoking 'snap'", async () => {
                const fn = snap as () => Promise<void>;
                const error = await fn().catch((err) => err);
                expect (error).to.be.an.instanceOf(NoDriverSessionException);
            });
        });
    });

    describe("when using an existing driver", () => {
        return null;
    });

    describe("when taking a screenshot", function() {
        let snappit: Snappit;
        let driver: ThenableWebDriver;
        this.timeout(15000);
        this.slow(2500);

        before(async () => {
            // Reset reference images

            // Initialize Snappit
            const config: IConfig = {
                browser: "chrome",
                screenshotsDir: "test/screenshots",
                threshold: 0.1,
                useDirect: true,
            };

            snappit = new Snappit(config);
            driver = snappit.start();
            await setViewportSize(driver, {width: 960, height: 768}); // Slightly smaller than TravisCI
            await driver.get("http://localhost:8080/");
        });

        after(async () => {
            await snappit.stop();
        });

        /**
         * For the tests below, we use the size of the existing reference PNG to determine if a new PNG has been
         * saved.  If this proves unreliable, we could also take the screenshot a second time and assume that
         * it will not error.
         */
        it("should throw an error and save if the screenshot does not exist", async () => {
            const error = await snap("does-not-exist.png", $("#color-div")).catch((err) => err);
            expect(error).to.be.an.instanceof(ScreenshotNotPresentException);
            expect(fs.existsSync("./test/screenshots/does-not-exist.png")).to.eql(true);
        });

        it("should throw an error and save if the screenshot is a different size", async () => {
            const error = await snap("different-size.png", $("#color-div")).catch((err) => err);
            expect(error).to.be.an.instanceof(ScreenshotSizeException);
            expect(sameAsReference("different-size.png")).to.eql(false);
        });

        it("should throw an error and save if the screenshot is different above threshold", async () => {
            const error = await snap("different-above-threshold.png", $("#color-div")).catch((err) => err);
            expect(error).to.be.an.instanceof(ScreenshotMismatchException);
            expect(sameAsReference("different-above-threshold.png")).to.eql(false);
        });

        it("should not throw an error or save if the screenshot is different below threshold", async () => {
            await snap("different-below-threshold.png", $("#color-div"));
            expect(sameAsReference("different-below-threshold.png")).to.eql(true);
        });

        it("should not throw an error or save if the screenshot shows no difference", async () => {
            await snap("no-difference.png", $("#color-div"));
            expect(sameAsReference("no-difference.png")).to.eql(true);
        });

        it("should take a screenshot with directory and path tokens", async () => {
            /**
             * We need the image to be the same size to validate, but the browser size might change.  This
             * is a result of the viewport size varying between potential test platforms.  Also the version
             * of chrome we use to test may regularly change.  This test does somewhat overfit.
             */
            const size = await driver.manage().window().getSize();
            const version = (await driver.getCapabilities()).get("version").replace(/\W+/gi, "-");
            const path = `./test/screenshots/chrome/${version}/${size.width}x${size.height}/test.png`;

            // This will error because the screenshot does not already exist, but we only care if it's created.
            await snap("{browserName}/{browserVersion}/{browserSize}/test.png").catch((err) => err);
            expect(fs.existsSync(path)).to.eql(true);
        });

        it("should take a fullscreen screenshot that shows no difference", async () => {
            await snap("fullscreen.png");
            expect(sameAsReference("fullscreen.png")).to.eql(true);
        });
    });
});