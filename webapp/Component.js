sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "com/zeim/fatturazioneattiva/model/models"
], (UIComponent, JSONModel, models) => {
    "use strict";

    return UIComponent.extend("com.zeim.fatturazioneattiva.Component", {
        metadata: { manifest: "json", interfaces: ["sap.ui.core.IAsyncContentCreation"] },

        init() {
            UIComponent.prototype.init.apply(this, arguments);

            this.setModel(models.createDeviceModel(), "device");
            this.getRouter().initialize();

            const oAppModel = new JSONModel({
                intent: { semanticObject: "", action: "" },
                ui: {
                    showSegmented: true,
                    tipoFatturaSdLabel: "Tipo Fattura SD"
                }
            });
            this.setModel(oAppModel, "appModel");

            const bInFLP = !!(sap.ushell && sap.ushell.Container);
            if (!bInFLP) return;

            sap.ushell.Container.getServiceAsync("ShellNavigation").then((oShellNav) => {
                const oHC = oShellNav.hashChanger;

                const apply = async (sHash) => {
                    console.log("---- APPLY CALLED ----");
                    console.log("Raw hash:", sHash);

                    const m = /^([^-\?]+)-([^\?]+)(?:\?.*)?$/.exec(sHash || "");
                    const semanticObject = m ? m[1] : "";
                    const action = m ? m[2] : "";

                    console.log("Parsed semanticObject:", semanticObject);
                    console.log("Parsed action:", action);

                    oAppModel.setProperty("/intent/semanticObject", semanticObject);
                    oAppModel.setProperty("/intent/action", action);

                    const bReverse = action === "reverseCharge";

                    oAppModel.setProperty("/ui/showSegmented", !bReverse);
                    oAppModel.setProperty(
                        "/ui/tipoFatturaSdLabel",
                        bReverse ? "Tipo Fattura" : "Tipo Fattura SD"
                    );

                    const oBundle = this.getModel("i18n")?.getResourceBundle();

                    const sTitle = bReverse
                        ? (oBundle?.getText("flpTitle2") || "Reverse Charge")
                        : (oBundle?.getText("flpTitle") || "Fatturazione Attiva");

                    console.log("Computed title:", sTitle);

                    document.title = sTitle;

                    try {
                        const oShellUIService = await this.getService("ShellUIService");
                        console.log("Injected ShellUIService:", oShellUIService);

                        if (oShellUIService?.setTitle) {
                            console.log("Calling ShellUIService.setTitle:", sTitle);
                            oShellUIService.setTitle(sTitle);
                        } else {
                            console.log("ShellUIService.setTitle not available");
                        }
                    } catch (e) {
                        console.log("ShellUIService injection failed:", e);
                    }
                };

                apply(oHC?._oNavigationState?.newHash || "");

                oHC.attachEvent("shellHashChanged", (e) => {
                    apply(e.getParameter("newHash"));
                });
            });
        }
    });
});
