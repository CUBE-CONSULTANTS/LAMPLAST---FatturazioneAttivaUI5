sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/codeeditor/CodeEditor",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/ui/export/Spreadsheet",
    "sap/m/VariantItem"
], function (Controller, CodeEditor, Dialog, Button, Spreadsheet, VariantItem) {
    "use strict";

    return Controller.extend("com.zeim.fatturazioneattiva.controller.Home", {

        onInit: function () {
            var oMultiInput = this.byId("multiInput");
            this._oMultiInput = oMultiInput;

            var oViewModel = new sap.ui.model.json.JSONModel({
                currentFlow: "sd",
                counts: {
                    All: 0,
                    Processed: 0,
                    Working: 0,
                    Error: 0
                },
                messageStrip: {
                    visible: false
                }
            });
            this.getView().setModel(oViewModel, "viewModel");

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

            if (this._filters.tipoFatturaSD) {
                this._filters.tipoFatturaSD.setVisibleInFilterBar(true);
            }

            if (this._filters.tipoFatturaFI) {
                this._filters.tipoFatturaFI.setVisibleInFilterBar(false);
            }

            this._adaptUiByIntent();
            this._bindTableByFlow("sd", true);
            this._initVariantManagement();
        },

        _getIntentAction: function () {
            return this.getOwnerComponent().getModel("appModel")?.getProperty("/intent/action") || "";
        },

        _isReverseCharge: function () {
            return this._getIntentAction() === "reverseCharge";
        },

        _adaptUiByIntent: function () {
            if (!this._isReverseCharge()) return;

            const oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/currentFlow", "sd");

            if (this._filters.tipoFatturaSD) this._filters.tipoFatturaSD.setVisibleInFilterBar(true);
            if (this._filters.tipoFatturaFI) this._filters.tipoFatturaFI.setVisibleInFilterBar(false);

            const oSegmented = this.byId("idSegmentedBtn");
            if (oSegmented) {
                oSegmented.setSelectedKey("sd");
            }
        },

        _getListPath: function (sFlowKey) {
            if (this._isReverseCharge()) {
                return "/zeim_att_rv_getlist(FLUSSO='X')/Set";
            }

            const sFlussoParam = sFlowKey === "fi" ? "F" : "S";
            return `/zeim_att_getlist(FLUSSO='${sFlussoParam}')/Set`;
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
                this._clearTableSelection();
                this._updateInvioIntermediarioButton();
            }

            if (!this._pagination.hasMore || this._pagination.isLoading) return;

            const sPath = this._getListPath(sFlowKey);

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
                Processed: aFatture.filter(f => f.esito?.toLowerCase().includes("completato")).length,
                Working: aFatture.filter(f => f.esito?.toLowerCase().includes("da processare")).length,
                Error: aFatture.filter(f => f.esito?.toLowerCase().includes("errore")).length
            };

            oViewModel.setProperty("/counts", oCounts);
        },

        onSegmentedButtonSelectionChange: function (oEvent) {
            if (this._isReverseCharge()) return;

            const sKey = oEvent.getParameter("item").getKey();
            const bIsSD = sKey === "sd";
            const bIsFI = sKey === "fi";

            if (this._filters.tipoFatturaSD) {
                this._filters.tipoFatturaSD.setVisibleInFilterBar(bIsSD);
            }

            if (this._filters.tipoFatturaFI) {
                this._filters.tipoFatturaFI.setVisibleInFilterBar(bIsFI);
            }

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

            const oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/currentFlow", sKey);

            this.oFilterBar.invalidate();
            this.oFilterBar.rerender();

            this.getView().getModel("fattureModel").setData({ results: [] });
            this._clearTableSelection();
            this._updateCounts();
            this._updateInvioIntermediarioButton();

            this._bindTableByFlow(sKey, true);
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
            const bIsRC = this._isReverseCharge();
            const sFlusso = bIsRC ? "X" : (this.getView().getModel("viewModel").getProperty("/currentFlow") === "fi" ? "F" : "S");

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
            const oCodeEditor = new CodeEditor({
                type: "xml",
                value: sXmlContent,
                height: "500px",
                width: "100%",
                editable: false,
                lineNumbers: true,
                syntaxHints: true
            });

            const oDialog = new Dialog({
                title: sFilename || "Visualizza XML",
                contentWidth: "80%",
                contentHeight: "60%",
                draggable: true,
                resizable: true,
                content: [oCodeEditor],
                buttons: [
                    new Button({
                        text: "Chiudi",
                        press: function () {
                            oDialog.close();
                        }
                    })
                ],
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        onShowAdvancedPDFDialog: async function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext("fattureModel");
            if (!oContext) {
                sap.m.MessageToast.show("Impossibile determinare il contesto della riga selezionata.");
                return;
            }

            const oData = oContext.getObject();
            const sFlow = this.getView().getModel("viewModel").getProperty("/currentFlow");
            const bIsRC = this._isReverseCharge();
            const sFlusso = bIsRC ? "X" : (sFlow === "fi" ? "F" : "S");
            const oDataModel = this.getOwnerComponent().getModel("mainService");

            const sBukrs = oData.bukrs;
            const sBelnr = oData.belnr;
            const sGjahr = oData.gjahr;

            if (!sBukrs || !sBelnr || !sGjahr) {
                sap.m.MessageBox.warning("Dati incompleti per la chiamata PDF (bukrs/belnr/gjahr mancanti).");
                return;
            }

            const sPath = `/ZEIM_GetPDFAccountingDocument(bukrs='${sBukrs}',belnr='${sBelnr}',gjahr='${sGjahr}',FLUSSO='${sFlusso}')`;

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

                const pdfDataUrl = "data:application/pdf;base64," + oResponse.base64;
                const oIframe = new sap.ui.core.HTML({
                    content: `<iframe src="${pdfDataUrl}" width="100%" height="700px" style="border:none;"></iframe>`
                });

                const oDialog = new Dialog({
                    title: `Visualizza Fattura (${bIsRC ? "RC" : sFlow.toUpperCase()})`,
                    contentWidth: "90%",
                    contentHeight: "100%",
                    resizable: true,
                    draggable: true,
                    content: [oIframe],
                    beginButton: new Button({
                        text: "Chiudi",
                        press: function () {
                            oDialog.close();
                        }
                    }),
                    afterClose: function () {
                        oDialog.destroy();
                    }
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
            const oBinding = oTable.getBinding("rows");

            if (!oBinding) return;

            let aTabFilters = [];

            switch (sKey) {
                case "Processed":
                    aTabFilters = [new sap.ui.model.Filter("esito", sap.ui.model.FilterOperator.EQ, "Completato")];
                    break;
                case "Working":
                    aTabFilters = [new sap.ui.model.Filter("esito", sap.ui.model.FilterOperator.EQ, "Da processare")];
                    break;
                case "Error":
                    aTabFilters = [new sap.ui.model.Filter("esito", sap.ui.model.FilterOperator.EQ, "Errore")];
                    break;
                case "All":
                default:
                    aTabFilters = [];
            }

            this._clearTableSelection();
            this._updateInvioIntermediarioButton();

            oBinding.filter(aTabFilters, sap.ui.model.FilterType.Application);
        },

        onSelectionChange: function (oEvent) {
            if (this._bChangingSelection) {
                return;
            }

            const oTable = this.byId("idTableFatture");
            const bSelectAll = oEvent.getParameter("selectAll");

            this._bChangingSelection = true;

            try {
                if (bSelectAll) {
                    if (this._bSendableSelectAllActive) {
                        oTable.clearSelection();
                        this._bSendableSelectAllActive = false;
                        this._updateInvioIntermediarioButton();
                        return;
                    }

                    oTable.clearSelection();

                    const oBinding = oTable.getBinding("rows");
                    const iLength = oBinding ? oBinding.getLength() : 0;

                    for (let i = 0; i < iLength; i++) {
                        const oContext = oTable.getContextByIndex(i);

                        if (!oContext) {
                            continue;
                        }

                        const oData = oContext.getObject();

                        if (this._isFatturaSendable(oData)) {
                            oTable.addSelectionInterval(i, i);
                        }
                    }

                    this._bSendableSelectAllActive = true;
                    this._updateInvioIntermediarioButton();

                    sap.m.MessageToast.show("Sono state selezionate solo le fatture inviabili.");
                    return;
                }

                this._bSendableSelectAllActive = false;

                const aSelectedIndices = oTable.getSelectedIndices();
                let bRemovedInvalidSelection = false;

                aSelectedIndices.forEach(function (iIndex) {
                    const oContext = oTable.getContextByIndex(iIndex);

                    if (!oContext) {
                        return;
                    }

                    const oData = oContext.getObject();

                    if (!this._isFatturaSendable(oData)) {
                        oTable.removeSelectionInterval(iIndex, iIndex);
                        bRemovedInvalidSelection = true;
                    }
                }.bind(this));

                if (bRemovedInvalidSelection) {
                    sap.m.MessageToast.show("Sono selezionabili solo le fatture inviabili.");
                }

                this._updateInvioIntermediarioButton();

            } finally {
                this._bChangingSelection = false;
            }
        },

        _getSelectedFattureFromTable: function () {
            const oTable = this.byId("idTableFatture");

            if (!oTable) {
                return [];
            }

            const aSelectedIndices = oTable.getSelectedIndices();

            return aSelectedIndices.map(function (iIndex) {
                const oContext = oTable.getContextByIndex(iIndex);

                if (!oContext) {
                    return null;
                }

                return {
                    index: iIndex,
                    data: oContext.getObject()
                };
            }).filter(Boolean);
        },

        _clearTableSelection: function () {
            const oTable = this.byId("idTableFatture");

            this._bSendableSelectAllActive = false;

            if (oTable && oTable.clearSelection) {
                oTable.clearSelection();
            }
        },

        _updateInvioIntermediarioButton: function () {
            const oButton = this.byId("btnInviaIntermediario");

            if (!oButton) {
                return;
            }

            const bHasValidSelection = this._getSelectedFattureFromTable().some(function (oSelected) {
                return this._isFatturaSendable(oSelected.data);
            }.bind(this));

            oButton.setEnabled(bHasValidSelection);
        },

        _isFatturaSendable: function (oData) {
            return oData && (oData.sendable === true || oData.sendable === "true");
        },

        onCreateXML: function () {
            var aSelectedRows = this._getSelectedFattureFromTable();

            aSelectedRows.forEach(function (oSelected, index) {
                var oRow = oSelected.data;
                var sXmlContent = oRow.XmlContent;
                var sCliente = oRow.Cliente || oRow.kunnr || "";

                var sFileName = "fattura_" + sCliente + "_" + index + ".xml";
                var blob = new Blob([sXmlContent], { type: "application/xml" });
                var link = document.createElement("a");
                link.href = window.URL.createObjectURL(blob);
                link.download = sFileName;
                link.click();
            });
        },

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
                        maxKeyLength: 10,
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
                        multiInputId: "multiInputTipoFatturaFI"
                    }
                );
            }.bind(this));
        },

        formatter: {
            statusState: function (sEsito) {
                if (!sEsito) return "None";
                sEsito = sEsito.toLowerCase();

                if (sEsito.includes("completato")) return "Success";
                if (sEsito.includes("errore")) return "Error";
                if (sEsito.includes("da processare")) return "Warning";
                return "None";
            },

            statusIcon: function (sEsito) {
                if (!sEsito) return "sap-icon://question-mark";
                sEsito = sEsito.toLowerCase();

                if (sEsito.includes("completato")) return "sap-icon://accept";
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
                const gjahr = oData.gjahr;

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

                const sHash = oCrossAppNav.hrefForExternal({
                    target: {
                        semanticObject: "BillingDocument",
                        action: "changeBillingDocument"
                    },
                    params: {
                        BillingDocument: vbeln
                    }
                });

                const sScopeFilter = "sap-navigation-scope-filter=F7697";
                const sFullUrl = window.location.origin + "/ui" + sHash + "&sap-app-origin-hint=&" + sScopeFilter;

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
                    filters.push(new sap.ui.model.Filter("belnr", "Contains", docValue));
                }
            }

            const inputDocFattura = this.byId("inputDocFattura");
            if (inputDocFattura) {
                const docFatturaValue = inputDocFattura.getValue()?.trim();
                if (docFatturaValue) {
                    filters.push(new sap.ui.model.Filter("vbeln", "Contains", docFatturaValue));
                }
            }

            const flow = viewModel.getProperty("/currentFlow");

            if (!this._isReverseCharge()) {
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

            const sPath = this._getListPath(flow);

            const PAGE_SIZE = 50;
            let skip = 0;
            let allResults = [];

            this._clearTableSelection();
            this._updateInvioIntermediarioButton();

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
                            loadPage();
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
        },

        onFilterBarClear: function () {
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

            this.getView().getModel("fattureModel").setData({ results: [] });
            this._clearTableSelection();
            this._updateCounts();
            this._updateInvioIntermediarioButton();
        },

        onInvioData: function () {
            var aSelectedRows = this._getSelectedFattureFromTable()
                .map(function (oSelected) {
                    return oSelected.data;
                })
                .filter(function (oRow) {
                    return this._isFatturaSendable(oRow);
                }.bind(this));

            if (!aSelectedRows.length) {
                sap.m.MessageToast.show("Seleziona almeno una fattura inviabile.");
                return;
            }

            this.getView().getModel("viewModel").setProperty("/messageStrip/visible", true);

            var sFlowKey = this.getView().getModel("viewModel").getProperty("/currentFlow");
            var bIsRC = this._isReverseCharge();
            var sFlusso = bIsRC ? "X" : (sFlowKey === "fi" ? "F" : "S");

            var aKeys = aSelectedRows.map(function (oRow) {
                return {
                    bukrs: oRow.bukrs,
                    belnr: oRow.belnr,
                    gjahr: oRow.gjahr,
                    flusso: sFlusso
                };
            });

            var oModel = this.getOwnerComponent().getModel("mainService");

            if (!oModel) {
                this.getView().getModel("viewModel").setProperty("/messageStrip/visible", false);
                this.byId("btnInviaIntermediario").setEnabled(true);
                sap.m.MessageBox.error("Model mainService non trovato.");
                return;
            }

            var sGroupId = "invioIntermediario";
            var sChangeSetId = "invioIntermediarioSet";

            this.byId("btnInviaIntermediario").setEnabled(false);
            sap.ui.core.BusyIndicator.show(0);

            oModel.setDeferredGroups([sGroupId]);

            oModel.refreshSecurityToken(function () {
                aKeys.forEach(function (oKey) {
                    oModel.create("/ZEIM_INVIO_INTERMEDIARIO", oKey, {
                        groupId: sGroupId,
                        changeSetId: sChangeSetId
                    });
                });

                sap.m.MessageToast.show("Invio avviato per " + aKeys.length + " fatture.");

                oModel.submitChanges({
                    groupId: sGroupId,
                    success: function () {
                        sap.ui.core.BusyIndicator.hide();

                        this._bSendableSelectAllActive = false;

                        this._clearTableSelection();
                        this._updateInvioIntermediarioButton();

                        this._bindTableByFlow(sFlowKey, true);

                        this.getView().getModel("viewModel").setProperty("/messageStrip/visible", false);
                    }.bind(this),

                    error: function (oError) {
                        sap.ui.core.BusyIndicator.hide();

                        this.byId("btnInviaIntermediario").setEnabled(true);
                        this.getView().getModel("viewModel").setProperty("/messageStrip/visible", false);

                        console.error("Errore durante l'invio massivo:", oError);
                        sap.m.MessageBox.error("Errore durante l'invio massivo.");
                    }.bind(this)
                });
            }.bind(this), function () {
                sap.ui.core.BusyIndicator.hide();

                this.byId("btnInviaIntermediario").setEnabled(true);
                this.getView().getModel("viewModel").setProperty("/messageStrip/visible", false);

                sap.m.MessageBox.error("Impossibile ottenere CSRF token.");
            }.bind(this));
        },

        onButtonRiceviEsitoPress: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("fattureModel");

            if (!oContext) {
                sap.m.MessageToast.show("Impossibile determinare la fattura selezionata.");
                return;
            }

            var oRow = oContext.getObject();

            var sNumeroFattura = oRow.belnr;
            var sDataFattura = this._formatDateForBackend(oRow.budat);

            if (!sNumeroFattura || !sDataFattura) {
                sap.m.MessageBox.warning("Numero fattura o data fattura mancanti.");
                return;
            }

            var oModel = this.getOwnerComponent().getModel("mainService");

            if (!oModel) {
                sap.m.MessageBox.error("Model mainService non trovato.");
                return;
            }

            var oPayload = {
                belnr: sNumeroFattura,
                budat: sDataFattura
            };

            sap.ui.core.BusyIndicator.show(0);

            oModel.create("/ZEIM_RECUPERO_STATO_FATTURA", oPayload, {
                success: function () {
                    sap.ui.core.BusyIndicator.hide();

                    sap.m.MessageToast.show("Recupero esito fattura avviato correttamente.");

                    var sFlowKey = this.getView().getModel("viewModel").getProperty("/currentFlow");
                    this._bindTableByFlow(sFlowKey, true);
                }.bind(this),

                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();

                    console.error("Errore recupero esito fattura:", oError);

                    var sMessage = "Errore durante il recupero esito fattura.";

                    try {
                        var oResponse = JSON.parse(oError.responseText);
                        sMessage = oResponse.error?.message?.value || oResponse.error?.message || sMessage;
                    } catch (e) {
                        if (oError.responseText) {
                            sMessage = oError.responseText;
                        }
                    }

                    sap.m.MessageBox.error(sMessage);
                }
            });
        },

        onExportExcel: function () {
            var oModel = this.getView().getModel("fattureModel");
            var aData = oModel.getProperty("/results") || [];

            if (!aData.length) {
                sap.m.MessageToast.show("Nessun dato da esportare.");
                return;
            }

            var aColumns = [
                { label: "Società", property: "bukrs" },
                { label: "Cliente", property: "kunnr" },
                { label: "Nominativo", property: "CustomerName" },
                { label: "P.IVA", property: "stcd2" },
                { label: "C.F.", property: "stcd1" },
                { label: "Doc Fatt", property: "vbeln" },
                { label: "N° Doc", property: "belnr" },
                { label: "Data Reg", property: "budat" },
                { label: "Esercizio", property: "gjahr" },
                { label: "Tot Fattura", property: "wrbtr", type: "number" },
                { label: "Valuta", property: "waers" },
                { label: "CD Univoco", property: "cd_univoco" },
                { label: "PEC", property: "PEC" },
                { label: "Esito", property: "esito" },
                { label: "Messaggio", property: "message" }
            ];

            var oSettings = {
                workbook: {
                    columns: aColumns
                },
                dataSource: aData,
                fileName: "Cruscotto_Fatture.xlsx",
                worker: false
            };

            var oSpreadsheet = new Spreadsheet(oSettings);

            oSpreadsheet.build()
                .finally(function () {
                    oSpreadsheet.destroy();
                });
        },

        _formatDateForBackend: function (vDate) {
            if (!vDate) {
                return "";
            }

            if (typeof vDate === "string") {
                if (vDate.includes("T")) {
                    return vDate.split("T")[0];
                }

                return vDate;
            }

            var oDate = new Date(vDate);

            var sYear = oDate.getFullYear();
            var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
            var sDay = String(oDate.getDate()).padStart(2, "0");

            return sYear + "-" + sMonth + "-" + sDay;
        },

        _getColumnLayoutConfig: function () {
            return [
                { id: "colBukrs", text: "Società" },
                { id: "colKunnr", text: "Cliente" },
                { id: "colCustomerName", text: "Nominativo" },
                { id: "colStcd2", text: "P.IVA" },
                { id: "colStcd1", text: "C.F." },
                { id: "colVbeln", text: "Doc Fatt" },
                { id: "colBelnr", text: "N° Doc" },
                { id: "colBudat", text: "Data Reg" },
                { id: "colGjahr", text: "Esercizio" },
                { id: "colWrbtr", text: "Tot Fattura" },
                { id: "colCdUnivoco", text: "CD Univoco" },
                { id: "colPec", text: "PEC" },
                { id: "colEsito", text: "Esito" },
                { id: "colMessage", text: "Messaggio" },
                { id: "colAzioni", text: "Azioni" }
            ];
        },

        onOpenColumnLayoutDialog: function () {
            var aConfig = this._getColumnLayoutConfig();

            var oList = new sap.m.List({
                mode: "MultiSelect",
                includeItemInSelection: true
            });

            aConfig.forEach(function (oColumnConfig) {
                var oColumn = this.byId(oColumnConfig.id);

                if (!oColumn) {
                    return;
                }

                oList.addItem(new sap.m.StandardListItem({
                    title: oColumnConfig.text,
                    selected: oColumn.getVisible()
                }).data("columnId", oColumnConfig.id));
            }.bind(this));

            var oDialog = new sap.m.Dialog({
                title: "Layout colonne",
                contentWidth: "420px",
                contentHeight: "520px",
                resizable: true,
                draggable: true,
                content: [oList],
                beginButton: new sap.m.Button({
                    text: "Applica",
                    type: "Emphasized",
                    press: function () {
                        oList.getItems().forEach(function (oItem) {
                            var sColumnId = oItem.data("columnId");
                            var oColumn = this.byId(sColumnId);

                            if (oColumn) {
                                oColumn.setVisible(oItem.getSelected());
                            }
                        }.bind(this));

                        oDialog.close();
                    }.bind(this)
                }),
                endButton: new sap.m.Button({
                    text: "Annulla",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            this.getView().addDependent(oDialog);
            oDialog.open();
        },

        _getVariantStorageKey: function () {
            var sIntent = this._isReverseCharge() ? "RC" : "STANDARD";
            var sFlow = this.getView().getModel("viewModel").getProperty("/currentFlow") || "sd";

            return "ZEIM_FATTURAZIONE_ATTIVA_VARIANTS_" + sIntent + "_" + sFlow.toUpperCase();
        },

        _getVariantData: function () {
            var sKey = this._getVariantStorageKey();
            var sValue = localStorage.getItem(sKey);

            if (!sValue) {
                return {
                    variants: {},
                    defaultVariantKey: ""
                };
            }

            try {
                return JSON.parse(sValue);
            } catch (e) {
                return {
                    variants: {},
                    defaultVariantKey: ""
                };
            }
        },

        _setVariantData: function (oData) {
            var sKey = this._getVariantStorageKey();
            localStorage.setItem(sKey, JSON.stringify(oData));
        },

        _initVariantManagement: function () {
            var oVariantManagement = this.byId("variantManagement");

            if (!oVariantManagement) {
                return;
            }

            oVariantManagement.removeAllItems();

            var oVariantData = this._getVariantData();
            var aVariantKeys = Object.keys(oVariantData.variants || {});

            aVariantKeys.forEach(function (sKey) {
                var oVariant = oVariantData.variants[sKey];

                oVariantManagement.addItem(new VariantItem({
                    key: sKey,
                    text: oVariant.name,
                    remove: true,
                    rename: true,
                    changeable: true
                }));
            });

            if (oVariantData.defaultVariantKey && oVariantData.variants[oVariantData.defaultVariantKey]) {
                oVariantManagement.setDefaultKey(oVariantData.defaultVariantKey);
                oVariantManagement.setSelectedKey(oVariantData.defaultVariantKey);

                this._applyTableLayout(oVariantData.variants[oVariantData.defaultVariantKey].layout);
            } else {
                oVariantManagement.setSelectedKey("");
            }
        },

        _getCurrentTableLayout: function () {
            var oTable = this.byId("idTableFatture");

            return {
                columns: oTable.getColumns().map(function (oColumn, iIndex) {
                    return {
                        id: oColumn.getId().split("--").pop(),
                        index: iIndex,
                        visible: oColumn.getVisible(),
                        width: oColumn.getWidth()
                    };
                })
            };
        },

        _applyTableLayout: function (oLayout) {
            if (!oLayout || !oLayout.columns) {
                return;
            }

            var oTable = this.byId("idTableFatture");

            oLayout.columns.forEach(function (oColumnLayout) {
                var oColumn = this.byId(oColumnLayout.id);

                if (!oColumn) {
                    return;
                }

                if (typeof oColumnLayout.visible === "boolean") {
                    oColumn.setVisible(oColumnLayout.visible);
                }

                if (oColumnLayout.width) {
                    oColumn.setWidth(oColumnLayout.width);
                }
            }.bind(this));

            oLayout.columns
                .slice()
                .sort(function (a, b) {
                    return a.index - b.index;
                })
                .forEach(function (oColumnLayout, iTargetIndex) {
                    var oColumn = this.byId(oColumnLayout.id);

                    if (!oColumn) {
                        return;
                    }

                    oTable.removeColumn(oColumn);
                    oTable.insertColumn(oColumn, iTargetIndex);
                }.bind(this));
        },

        onVariantSave: function (oEvent) {
            var oVariantManagement = this.byId("variantManagement");
            var oVariantData = this._getVariantData();

            var sName = oEvent.getParameter("name");
            var sKey = oEvent.getParameter("key");
            var bOverwrite = oEvent.getParameter("overwrite");
            var bDefault = oEvent.getParameter("def");

            if (!sName && !sKey) {
                return;
            }

            if (!sKey || !bOverwrite) {
                sKey = "VARIANT_" + Date.now();
            }

            oVariantData.variants[sKey] = {
                key: sKey,
                name: sName || oVariantData.variants[sKey]?.name || "Layout",
                layout: this._getCurrentTableLayout()
            };

            if (bDefault) {
                oVariantData.defaultVariantKey = sKey;
            }

            this._setVariantData(oVariantData);
            this._initVariantManagement();

            oVariantManagement.setSelectedKey(sKey);

            sap.m.MessageToast.show("Layout salvato.");
        },

        onVariantSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");

            if (!sKey) {
                return;
            }

            var oVariantData = this._getVariantData();
            var oVariant = oVariantData.variants[sKey];

            if (!oVariant) {
                return;
            }

            this._applyTableLayout(oVariant.layout);
        },

        onVariantManage: function (oEvent) {
            var oVariantData = this._getVariantData();

            var aDeleted = oEvent.getParameter("deleted") || [];
            var aRenamed = oEvent.getParameter("renamed") || [];
            var sDefaultKey = oEvent.getParameter("def");

            aDeleted.forEach(function (sKey) {
                delete oVariantData.variants[sKey];

                if (oVariantData.defaultVariantKey === sKey) {
                    oVariantData.defaultVariantKey = "";
                }
            });

            aRenamed.forEach(function (oRenamed) {
                if (oVariantData.variants[oRenamed.key]) {
                    oVariantData.variants[oRenamed.key].name = oRenamed.name;
                }
            });

            if (sDefaultKey && oVariantData.variants[sDefaultKey]) {
                oVariantData.defaultVariantKey = sDefaultKey;
            }

            this._setVariantData(oVariantData);
            this._initVariantManagement();

            sap.m.MessageToast.show("Gestione layout aggiornata.");
        },


    });
});