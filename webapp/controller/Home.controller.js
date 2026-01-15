sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/codeeditor/CodeEditor",
    "sap/ui/core/Fragment",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/SearchField",
    "sap/ui/core/BusyIndicator",
    "sap/m/Token",
    "sap/ui/comp/library",
    "sap/ui/table/Column",
    "sap/m/Label",
    "sap/m/Text"
], function (Controller, CodeEditor, Fragment, Dialog, Button, SearchField, BusyIndicator, Token, compLibrary, UIColumn, Label, Text) {
    "use strict";

    return Controller.extend("com.zeim.fatturazioneattiva.controller.Home", {

        onInit: function () {

            var oMultiInput = this.byId("multiInput");
            this._oMultiInput = oMultiInput;

            //this.byId("multiInput").addValidator(this._onMultiInputValidate.bind(this));

            var oViewModel = new sap.ui.model.json.JSONModel({
                currentFlow: "sd",
                counts: {
                    All: 0,
                    Processed: 0,
                    Working: 0,
                    Error: 0
                }
            });
            this.getView().setModel(oViewModel, "viewModel");

            // modello dedicato per la tabella
            var oFattureModel = new sap.ui.model.json.JSONModel({ results: [] });
            this.getView().setModel(oFattureModel, "fattureModel");

            this.oFilterBar = this.byId("filterBar");

            const oDateRange = this.byId("dateRangePicker");
            if (oDateRange) {
                const oToday = new Date();
                const oPast = new Date();
                oPast.setMonth(oPast.getMonth() - 1);

                oDateRange.setDateValue(oPast);
                oDateRange.setSecondDateValue(oToday);
            }

            const aFGI = this.oFilterBar.getFilterGroupItems();
            this._filters = {
                tipoFatturaSD: aFGI.find(f => f.getName() === "Tipo Fattura SD"),
                tipoFatturaFI: aFGI.find(f => f.getName() === "Tipo Fattura FI")
            };

            // Mostra solo SD all'avvio
            if (this._filters.tipoFatturaSD) {
                this._filters.tipoFatturaSD.setVisibleInFilterBar(true);
            }
            if (this._filters.tipoFatturaFI) {
                this._filters.tipoFatturaFI.setVisibleInFilterBar(false);
            }

            const aCurrent = this.getView().getModel("fattureModel").getProperty("/results") || [];
            const iSkip = aCurrent.length;
            this._bindTableByFlow("sd", 100, iSkip);
        },

        _bindTableByFlow: function (sFlowKey, bReset = true) {
            const oModel = this.getOwnerComponent().getModel("mainService");
            const oFattureModel = this.getView().getModel("fattureModel");

            if (bReset) {
                this._pagination = {
                    flow: sFlowKey,
                    top: 200,
                    skip: 0,
                    hasMore: true,
                    isLoading: false
                };
                oFattureModel.setData({ results: [] });
            }

            if (!this._pagination.hasMore || this._pagination.isLoading) return;

            const sFlussoParam = sFlowKey === "fi" ? "F" : "S";
            const sPath = `/zeim_att_getlist(FLUSSO='${sFlussoParam}')/Set`;

            this._pagination.isLoading = true;
            sap.ui.core.BusyIndicator.show(0);

            const oDateRange = this.byId("dateRangePicker");
            let aDefaultFilters = [];

            if (oDateRange && oDateRange.getDateValue() && oDateRange.getSecondDateValue()) {
                const sFrom = oDateRange.getDateValue().toISOString().split("T")[0];
                const sTo = oDateRange.getSecondDateValue().toISOString().split("T")[0];
                aDefaultFilters.push(new sap.ui.model.Filter("budat", "BT", sFrom, sTo));
            }

            oModel.read(sPath, {
                filters: aDefaultFilters,
                urlParameters: {
                    "$top": this._pagination.top,
                    "$skip": this._pagination.skip
                },
                success: (oData) => {
                    const aNew = oData.results || [];
                    const aOld = oFattureModel.getProperty("/results") || [];
                    const aMerged = aOld.concat(aNew);

                    oFattureModel.setProperty("/results", aMerged);
                    this._updateCounts();

                    this._pagination.skip += aNew.length;
                    this._pagination.hasMore = aNew.length === this._pagination.top;
                    this._pagination.isLoading = false;

                    sap.ui.core.BusyIndicator.hide();

                    if (this._pagination.hasMore) {
                        setTimeout(() => this._bindTableByFlow(sFlowKey, false), 50);
                    }
                },
                error: (err) => {
                    console.error("Errore nel caricamento dati:", err);
                    sap.ui.core.BusyIndicator.hide();
                    this._pagination.isLoading = false;
                    this._pagination.hasMore = false;
                }
            });
        },




        _updateCounts: function () {
            const oFattureModel = this.getView().getModel("fattureModel");
            const aFatture = oFattureModel.getProperty("/results") || [];
            const oViewModel = this.getView().getModel("viewModel");

            const oCounts = {
                All: aFatture.length,
                Processed: aFatture.filter(f => f.esito?.toLowerCase().includes("processato")).length,
                Working: aFatture.filter(f => f.esito?.toLowerCase().includes("da processare")).length,
                Error: aFatture.filter(f => f.esito?.toLowerCase().includes("errore")).length
            };

            oViewModel.setProperty("/counts", oCounts);
        },




        onSegmentChange: function (oEvent) {
            const sKey = oEvent.getParameter("item").getKey();
            const bIsSD = sKey === "sd";
            const bIsFI = sKey === "fi";

            // Mostra / nascondi campi specifici
            if (this._filters.tipoFatturaSD) {
                this._filters.tipoFatturaSD.setVisibleInFilterBar(bIsSD);
            }
            if (this._filters.tipoFatturaFI) {
                this._filters.tipoFatturaFI.setVisibleInFilterBar(bIsFI);
            }

            // 🔹 Svuota tutti i controlli della FilterBar
            const oFilterBar = this.byId("filterBar");
            if (oFilterBar) {
                oFilterBar.getFilterGroupItems().forEach(item => {
                    const ctrl = item.getControl();
                    if (!ctrl) return;

                    if (ctrl.isA("sap.m.MultiInput")) {
                        ctrl.removeAllTokens();
                    } else if (ctrl.isA("sap.m.Select")) {
                        ctrl.setSelectedKey("");
                    } else if (ctrl.isA("sap.m.Input")) {
                        ctrl.setValue("");
                    }
                });
            }

            // 🔹 Aggiorna modello di stato
            const oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/currentFlow", sKey);

            // 🔹 Aggiorna grafica FilterBar e reset tabella
            this.oFilterBar.invalidate();
            this.oFilterBar.rerender();

            // Svuota la tabella e i contatori
            this.getView().getModel("fattureModel").setData({ results: [] });
            this._updateCounts();

            // 🔹 Ricollega la tabella al nuovo flusso
            this._bindTableByFlow(sKey);
        },




        onViewXML: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext("fattureModel");
            if (!oContext) {
                sap.m.MessageToast.show("Impossibile determinare la fattura selezionata.");
                return;
            }

            const oRow = oContext.getObject();
            const sBukrs = oRow.bukrs;
            const sBelnr = oRow.belnr;
            const sGjahr = oRow.gjahr;
            //const sVbeln = oRow.vbeln;
            const sFlusso = this.getView().getModel("viewModel").getProperty("/currentFlow") === "fi" ? "F" : "S";

            const oModel = this.getOwnerComponent().getModel("mainService");

            const sPath = `/ZEIM_ATT_FATTURA_XML(bukrs='${sBukrs}',belnr='${sBelnr}',gjahr='${sGjahr}',flusso='${sFlusso}')`;

            sap.ui.core.BusyIndicator.show(0);

            oModel.read(sPath, {
                success: (oData) => {
                    sap.ui.core.BusyIndicator.hide();

                    let sXml = "";
                    try {
                        sXml = atob(oData.base64 || "");
                    } catch (e) {
                        sXml = "<Errore>Contenuto XML non valido</Errore>";
                    }

                    this._openXmlDialog(sXml, oData.filename);
                },
                error: () => {
                    sap.ui.core.BusyIndicator.hide();
                    sap.m.MessageToast.show("Errore nel recupero dell'XML dal backend.");
                }
            });
        },

        _openXmlDialog: function (sXmlContent, sFilename) {

            const oCodeEditor = new sap.ui.codeeditor.CodeEditor({
                type: "xml",
                value: sXmlContent,
                height: "500px",
                width: "100%",
                editable: false,
                lineNumbers: true,
                syntaxHints: true
            });

            const oDialog = new sap.m.Dialog({
                title: sFilename || "Visualizza XML",
                contentWidth: "80%",
                contentHeight: "60%",
                draggable: true,
                resizable: true,
                content: [oCodeEditor],
                buttons: [
                    new sap.m.Button({
                        text: "Chiudi",
                        press: function () { oDialog.close(); }
                    })
                ],
                afterClose: function () { oDialog.destroy(); }
            });

            oDialog.open();
        },




        onShowAdvancedPDFDialog: async function (oEvent) {
            // Usa il binding context corretto (mainService)
            const oContext = oEvent.getSource().getBindingContext("fattureModel");
            if (!oContext) {
                sap.m.MessageToast.show("Impossibile determinare il contesto della riga selezionata.");
                return;
            }

            const oData = oContext.getObject();
            const sFlow = this.getView().getModel("viewModel").getProperty("/currentFlow"); // "sd" o "fi"
            const oDataModel = this.getOwnerComponent().getModel("mainService"); // OData principale

            let sPath = "";

            // === FLUSSO SD ===
            if (sFlow === "sd") {
                const sBillingDocument = oData.vbeln; // campo corretto OData
                if (!sBillingDocument) {
                    sap.m.MessageToast.show("Numero documento mancante (vbeln).");
                    return;
                }
                const sBukrs = oData.bukrs;
                const sBelnr = oData.belnr;
                const sGjahr = oData.gjahr;
                const sflusso = oData.FLUSSO
                // costruisci dinamicamente il path per la function import
                sPath = `/ZEIM_GetPDFAccountingDocument(bukrs='${sBukrs}',belnr='${sBelnr}',gjahr='${sGjahr}',FLUSSO='${sflusso}')`;
            }

            // === FLUSSO FI ===
            else if (sFlow === "fi") {
                const sBukrs = oData.bukrs;
                const sBelnr = oData.belnr;
                const sGjahr = oData.gjahr;
                const sflusso = oData.FLUSSO

                if (!sBukrs || !sBelnr || !sGjahr) {
                    sap.m.MessageBox.warning("Dati incompleti per la chiamata PDF FI (bukrs/belnr/gjahr mancanti).");
                    return;
                }

                // path dinamico
                sPath = `/ZEIM_GetPDFAccountingDocument(bukrs='${sBukrs}',belnr='${sBelnr}',gjahr='${sGjahr}',FLUSSO='${sflusso}')`;
            }

            // === CONTROLLO PATH ===
            if (!sPath) {
                sap.m.MessageToast.show("Impossibile determinare il percorso per la chiamata PDF.");
                return;
            }

            sap.ui.core.BusyIndicator.show(0);

            try {
                const oResponse = await new Promise((resolve, reject) => {
                    oDataModel.read(sPath, {
                        success: resolve,
                        error: reject
                    });
                });

                sap.ui.core.BusyIndicator.hide();

                if (!oResponse || !oResponse.base64) {
                    sap.m.MessageToast.show("Nessun PDF disponibile per questo documento");
                    return;
                }

                // Creazione iframe per anteprima PDF
                const pdfDataUrl = "data:application/pdf;base64," + oResponse.base64;
                const oIframe = new sap.ui.core.HTML({
                    content: `<iframe src="${pdfDataUrl}" width="100%" height="700px" style="border:none;"></iframe>`
                });

                const oDialog = new sap.m.Dialog({
                    title: `Visualizza Fattura (${sFlow.toUpperCase()})`,
                    contentWidth: "90%",
                    contentHeight: "100%",
                    resizable: true,
                    draggable: true,
                    content: [oIframe],
                    beginButton: new sap.m.Button({
                        text: "Chiudi",
                        press: function () { oDialog.close(); }
                    }),
                    afterClose: function () { oDialog.destroy(); }
                });

                oDialog.open();

            } catch (err) {
                sap.ui.core.BusyIndicator.hide();
                console.error("Errore durante la lettura del PDF:", err);

                const sMsg = err?.message || err?.responseText || "Errore nel recupero del PDF dal backend.";
                sap.m.MessageBox.error(sMsg);
            }
        },



        onIconTabSelect: function (oEvent) {
            const sKey = oEvent.getParameter("key");
            const oTable = this.byId("idTableFatture");
            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            // costruisco il filtro per la colonna "esito"
            let aTabFilters = [];
            switch (sKey) {
                case "Processed":
                    aTabFilters = [new sap.ui.model.Filter("esito", sap.ui.model.FilterOperator.EQ, "Processato")];
                    break;
                case "Working":
                    aTabFilters = [new sap.ui.model.Filter("esito", sap.ui.model.FilterOperator.EQ, "Da processare")];
                    break;
                case "Error":
                    aTabFilters = [new sap.ui.model.Filter("esito", sap.ui.model.FilterOperator.EQ, "Errore")];
                    break;
                case "All":
                default:
                    aTabFilters = []; // rimuove filtro tab
            }

            oBinding.filter(aTabFilters, sap.ui.model.FilterType.Application);

            // aggiorna i contatori dopo il nuovo caricamento
            oBinding.attachEventOnce("dataReceived", this._updateCounts.bind(this));
        },




        onSelectionChange: function () {
            var oTable = this.byId("idTableFatture");
            var aSelected = oTable.getSelectedItems();
            this.byId("btnInviaIntermediario").setEnabled(aSelected.length > 0);
        },

        onCreateXML: function () {
            var oTable = this.byId("idTableFatture");
            var aSelectedItems = oTable.getSelectedItems();

            aSelectedItems.forEach(function (oItem, index) {
                var oContext = oItem.getBindingContext("fattureModel");
                var sXmlContent = oContext.getProperty("XmlContent");
                var sCliente = oContext.getProperty("Cliente");

                var sFileName = "fattura_" + sCliente + "_" + index + ".xml";
                var blob = new Blob([sXmlContent], { type: "application/xml" });
                var link = document.createElement("a");
                link.href = window.URL.createObjectURL(blob);
                link.download = sFileName;
                link.click();
            });
        },

        // _onMultiInputValidate: function (oArgs) {
        //     const oInput = oArgs.sender; // l'input che ha invocato la validazione
        //     const sModel = oInput.data("model");
        //     const sKeyProp = oInput.data("key");
        //     const sDescProp = oInput.data("desc");

        //     const oSuggestion = oArgs.suggestionObject;

        //     // Caso 1: Nessun suggerimento (token libero)
        //     if (!oSuggestion || !oSuggestion.getBindingContext) {
        //         return new sap.m.Token({
        //             key: oArgs.text,
        //             text: oArgs.text
        //         });
        //     }

        //     const oContext = oSuggestion.getBindingContext(sModel);
        //     if (!oContext) {
        //         return new sap.m.Token({
        //             key: oArgs.text,
        //             text: oArgs.text
        //         });
        //     }

        //     const oObj = oContext.getObject();
        //     if (!oObj[sKeyProp] || !oObj[sDescProp]) {
        //         return new sap.m.Token({
        //             key: oArgs.text,
        //             text: oArgs.text
        //         });
        //     }

        //     return new sap.m.Token({
        //         key: oObj[sKeyProp],
        //         text: `${oObj[sDescProp]} (${oObj[sKeyProp]})`
        //     });
        // },


        onValueHelpClienti: function () {
            sap.ui.require([
                "com/zeim/fatturazioneattiva/controller/helpers/ValueHelpHandler"
            ], function (VH) {
                VH.openValueHelp(
                    this,
                    "com.zeim.fatturazioneattiva.view.fragments.ValueHelpDialogFilterbarClienti",
                    "Clienti",
                    "/I_Customer",
                    {
                        key: "Customer",
                        desc: "OrganizationBPName1",
                        keyProp: "Customer",
                        maxKeyLength: 10, // regola: oltre 10 char non filtrare su Customer
                        filterProps: ["Customer", "OrganizationBPName1", "CityName"],
                        columns: [
                            { label: "Cliente", path: "Customer" },
                            { label: "Descrizione", path: "OrganizationBPName1" },
                            { label: "Città", path: "CityName" }
                        ],
                        multiInputId: "multiInput"
                    }
                );
            }.bind(this));
        },

        onValueHelpPaeseEsecutore: function () {
            sap.ui.require([
                "com/zeim/fatturazioneattiva/controller/helpers/ValueHelpHandler"
            ], function (VH) {
                VH.openValueHelp(
                    this,
                    "com.zeim.fatturazioneattiva.view.fragments.ValueHelpDialogFilterbarPaeseEsecutore",
                    "MCPaeseEsecutore",
                    "/I_Country",
                    {
                        key: "Country",
                        desc: "CountryName",
                        keyProp: "Country",
                        filterProps: ["Country", "Country_Text"],
                        columns: [
                            { label: "Codice Paese", path: "Country" },
                            { label: "Nome Paese", path: "Country_Text" }
                        ],
                        multiInputId: "multiInputPaeseEsecutore"
                    }
                );
            }.bind(this));
        },

        onValueHelpTipoFatturaSD: function () {
            sap.ui.require([
                "com/zeim/fatturazioneattiva/controller/helpers/ValueHelpHandler"
            ], function (VH) {
                VH.openValueHelp(
                    this,
                    "com.zeim.fatturazioneattiva.view.fragments.ValueHelpDialogFilterbarMCTipoFatturaSD",
                    "MCTipoFatturaSD",
                    "/I_BillingDocumentTypeStdVH",
                    {
                        key: "BillingDocumentType",
                        desc: "BillingDocumentType_Text",
                        keyProp: "BillingDocumentType",
                        filterProps: ["BillingDocumentType", "BillingDocumentType_Text"],
                        columns: [
                            { label: "Tipo Fattura", path: "BillingDocumentType" },
                            { label: "Descrizione", path: "BillingDocumentType_Text" }
                        ],
                        multiInputId: "multiInputTipoFatturaSD"
                    }
                );
            }.bind(this));
        },
        onValueHelpTipoFatturaFI: function () {
            sap.ui.require([
                "com/zeim/fatturazioneattiva/controller/helpers/ValueHelpHandler"
            ], function (VH) {
                VH.openValueHelp(
                    this,
                    "com.zeim.fatturazioneattiva.view.fragments.ValueHelpDialogFilterbarMCTipoFatturaFI",
                    "MCTipoFatturaFI",
                    "/I_AccountingDocumentType",
                    {
                        key: "AccountingDocumentType",
                        desc: "AccountingDocumentType_Text",
                        keyProp: "AccountingDocumentType",
                        filterProps: ["AccountingDocumentType", "AccountingDocumentType_Text"],
                        columns: [
                            { label: "Tipo Fattura", path: "AccountingDocumentType" },
                            { label: "Descrizione", path: "AccountingDocumentType_Text" }
                        ],
                        multiInputId: "multiInputTipoFatturaSD"
                    }
                );
            }.bind(this));
        },


        formatter: {
            statusState: function (sEsito) {
                if (!sEsito) return "None";
                sEsito = sEsito.toLowerCase();

                if (sEsito.includes("processato")) return "Success";
                if (sEsito.includes("errore")) return "Error";
                if (sEsito.includes("da processare")) return "Warning";
                return "None";
            },

            statusIcon: function (sEsito) {
                if (!sEsito) return "sap-icon://question-mark";
                sEsito = sEsito.toLowerCase();

                if (sEsito.includes("processato")) return "sap-icon://accept";
                if (sEsito.includes("errore")) return "sap-icon://error";
                if (sEsito.includes("da processare")) return "sap-icon://pending";
                return "sap-icon://question-mark";
            },


            formatDate: function (sDate) {
                if (!sDate) return "";
                const oDate = new Date(sDate);
                const oFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
                return oFormat.format(oDate);
            }
        },




        onNavToCliente: async function (oEvent) {
            try {
                const oContext = oEvent.getSource().getBindingContext("fattureModel");
                if (!oContext) {
                    sap.m.MessageToast.show("Impossibile determinare il cliente selezionato.");
                    return;
                }

                const oData = oContext.getObject();
                const sKunnr = oData.kunnr;
                if (!sKunnr) {
                    sap.m.MessageToast.show("Cliente (KUNNR) non disponibile.");
                    return;
                }

                const oCrossAppNav = await sap.ushell.Container.getServiceAsync("CrossApplicationNavigation");

                const sHash = oCrossAppNav.hrefForExternal({
                    target: {
                        semanticObject: "Customer",
                        action: "manage"
                    },
                    params: {
                        Customer: sKunnr
                    }
                });

                const sEntityPath = `/C_BusinessPartnerCustomer(BusinessPartner='${sKunnr}',DraftUUID=guid'00000000-0000-0000-0000-000000000000',IsActiveEntity=true)`;

                const sFullUrl = window.location.origin + "/ui" + sHash + "&sap-app-origin-hint=&" + sEntityPath;

                window.open(sFullUrl, "_blank");

            } catch (err) {
                console.error("Errore nella navigazione Cross-App:", err);
                sap.m.MessageBox.error("Impossibile aprire l'app Customer - Manage.");
            }
        },


        onNavToDocumento: async function (oEvent) {
            try {
                const oContext = oEvent.getSource().getBindingContext("fattureModel");
                if (!oContext) {
                    sap.m.MessageToast.show("Impossibile determinare il cliente selezionato.");
                    return;
                }

                const oData = oContext.getObject();
                const belnr = oData.belnr;
                const bukrs = oData.bukrs;
                const gjahr = oData.gjahr

                const Navigation = await sap.ushell.Container.getServiceAsync("Navigation");

                const sHref = await Navigation.getHref({
                    target: {
                        semanticObject: "AccountingDocument",
                        action: "displayV2"
                    },
                    params: {
                        AccountingDocument: belnr,
                        CompanyCode: bukrs,
                        FiscalYear: gjahr

                    }
                });

                console.log(" Navigazione FLP:", sHref);

                window.open(sHref, "_blank");
            } catch (err) {
                console.error("Errore nella navigazione Cross-App:", err);
            }
        },

        onNavToDocumentoVendita: async function (oEvent) {
            try {
                const oContext = oEvent.getSource().getBindingContext("fattureModel");
                if (!oContext) {
                    sap.m.MessageToast.show("Impossibile determinare il documento di vendita selezionato.");
                    return;
                }

                const oData = oContext.getObject();
                const vbeln = oData.vbeln;

                const oCrossAppNav = await sap.ushell.Container.getServiceAsync("CrossApplicationNavigation");

                // Hash generato dal FLP
                const sHash = oCrossAppNav.hrefForExternal({
                    target: {
                        semanticObject: "BillingDocument",
                        action: "changeBillingDocument"
                    },
                    params: {
                        BillingDocument: vbeln
                    }
                });

                // Se serve mantenere un navigation-scope-filter (come F7697)
                const sScopeFilter = "sap-navigation-scope-filter=F7697";

                // Costruzione URL finale (identico stile di onNavToCliente)
                const sFullUrl =
                    window.location.origin +
                    "/ui" +
                    sHash +
                    "&sap-app-origin-hint=&" +
                    sScopeFilter;

                console.log("URL finale:", sFullUrl);

                window.open(sFullUrl, "_blank");

            } catch (err) {
                console.error("Errore nella navigazione Cross-App:", err);
                sap.m.MessageBox.error("Impossibile aprire il documento di vendita.");
            }
        },



        onFilterBarSearch: function () {
            const mainService = this.getOwnerComponent().getModel("mainService");
            const viewModel = this.getView().getModel("viewModel");
            const fattureModel = this.getView().getModel("fattureModel");

            sap.ui.core.BusyIndicator.show(0);

            const filters = [];

            const clientiInput = this.byId("multiInput");
            if (clientiInput) {
                const clienti = clientiInput.getTokens().map(t => t.getKey() || t.getText());
                if (clienti.length) {
                    filters.push(new sap.ui.model.Filter({
                        filters: clienti.map(v => new sap.ui.model.Filter("kunnr", "EQ", v)),
                        and: false
                    }));
                }
            }

            const paeseInput = this.byId("multiInputPaeseEsecutore");
            if (paeseInput) {
                const paesi = paeseInput.getTokens().map(t => t.getKey() || t.getText());
                if (paesi.length) {
                    filters.push(new sap.ui.model.Filter({
                        filters: paesi.map(v => new sap.ui.model.Filter("land1", "EQ", v)),
                        and: false
                    }));
                }
            }

            const orgSelect = this.byId("selectOrgCommerciale");
            if (orgSelect?.getSelectedKey()) {
                filters.push(new sap.ui.model.Filter("vkorg", "EQ", orgSelect.getSelectedKey()));
            }

            const socSelect = this.byId("selectSocieta");
            if (socSelect?.getSelectedKey()) {
                filters.push(new sap.ui.model.Filter("bukrs", "EQ", socSelect.getSelectedKey()));
            }
            const inputDocumento = this.byId("inputDocumento");
            if (inputDocumento) {
                const docValue = inputDocumento.getValue()?.trim();
                if (docValue) {
                    filters.push(new sap.ui.model.Filter("belnr", "EQ", docValue));
                }
            }

            const flow = viewModel.getProperty("/currentFlow");
            if (flow === "sd") {
                const tipoSD = this.byId("multiInputTipoFatturaSD");
                if (tipoSD) {
                    const tokens = tipoSD.getTokens().map(t => t.getKey() || t.getText());
                    if (tokens.length) {
                        filters.push(new sap.ui.model.Filter({
                            filters: tokens.map(v => new sap.ui.model.Filter("fkart", "EQ", v)),
                            and: false
                        }));
                    }
                }
            } else if (flow === "fi") {
                const tipoFI = this.byId("multiInputTipoFatturaFI");
                if (tipoFI) {
                    const tokens = tipoFI.getTokens().map(t => t.getKey() || t.getText());
                    if (tokens.length) {
                        filters.push(new sap.ui.model.Filter({
                            filters: tokens.map(v => new sap.ui.model.Filter("blart", "EQ", v)),
                            and: false
                        }));
                    }
                }
            }

            const dateRange = this.byId("dateRangePicker");
            if (dateRange) {
                const from = dateRange.getDateValue();
                const to = dateRange.getSecondDateValue();

                if (from && to) {
                    const sStart = from.toISOString().split("T")[0];
                    const sEnd = to.toISOString().split("T")[0];
                    filters.push(new sap.ui.model.Filter("budat", "BT", sStart, sEnd));
                } else if (from) {
                    const sExact = from.toISOString().split("T")[0];
                    filters.push(new sap.ui.model.Filter("budat", "EQ", sExact));
                }
            }

            const sFlussoParam = flow === "fi" ? "F" : "S";
            const sPath = `/zeim_att_getlist(FLUSSO='${sFlussoParam}')/Set`;

            const PAGE_SIZE = 50;
            let skip = 0;
            let allResults = [];

            const loadPage = () => {
                mainService.read(sPath, {
                    filters: filters,
                    urlParameters: {
                        "$top": PAGE_SIZE,
                        "$skip": skip
                    },
                    success: (oData) => {
                        const results = oData.results || [];
                        allResults = allResults.concat(results);

                        if (results.length === PAGE_SIZE) {
                            skip += PAGE_SIZE;
                            loadPage(); // continua finché ci sono pagine
                        } else {
                            fattureModel.setData({ results: allResults });
                            this._updateCounts();
                            sap.ui.core.BusyIndicator.hide();
                        }
                    },
                    error: (err) => {
                        console.error("Errore durante la lettura filtrata:", err);
                        sap.ui.core.BusyIndicator.hide();
                    }
                });
            };

            loadPage();
        }




    });
});
