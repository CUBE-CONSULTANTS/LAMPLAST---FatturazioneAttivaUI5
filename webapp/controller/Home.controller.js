sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/codeeditor/CodeEditor",
    "sap/ui/core/Fragment",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/SearchField",
    "sap/ui/core/BusyIndicator",
    "sap/ui/model/type/String",
    "sap/m/Token",
    "sap/ui/comp/library",
    "sap/ui/table/Column",
    "sap/m/Label",
    "sap/m/Text"
], function (Controller, CodeEditor, Fragment, Dialog, Button, SearchField, BusyIndicator, TypeString, Token, compLibrary, UIColumn, Label, Text) {
    "use strict";

    return Controller.extend("com.zeim.fatturazioneattiva.controller.Home", {

        onInit: function () {

            var oMainModel = this.getOwnerComponent().getModel("mainService");
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

            this.oFilterBar = this.byId("filterBar");

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

            oMainModel.attachRequestCompleted(this._updateCounts.bind(this));
        },

        _updateCounts: function () {
            const oModel = this.getOwnerComponent().getModel("mainService");
            const oViewModel = this.getView().getModel("viewModel");

            oModel.read("/zeim_att_getlist", {
                success: (oData) => {
                    const aFatture = oData.results || [];

                    const oCounts = {
                        All: aFatture.length,
                        Processed: aFatture.filter(f => f.esito?.toLowerCase().includes("processato")).length,
                        Working: aFatture.filter(f => f.esito?.toLowerCase().includes("da processare")).length,
                        Error: aFatture.filter(f => f.esito?.toLowerCase().includes("errore")).length
                    };

                    oViewModel.setProperty("/counts", oCounts);
                },
                error: (err) => {
                    console.error("Errore nel recupero dei conteggi:", err);
                }
            });
        },


        onSegmentChange: function (oEvent) {
            const sKey = oEvent.getParameter("item").getKey();

            if (!this._filters || !this.oFilterBar) return;

            const bIsSD = sKey === "sd";
            const bIsFI = sKey === "fi";

            if (this._filters.tipoFatturaSD) {
                this._filters.tipoFatturaSD.setVisibleInFilterBar(bIsSD);
            }
            if (this._filters.tipoFatturaFI) {
                this._filters.tipoFatturaFI.setVisibleInFilterBar(bIsFI);
            }

            this.getView().getModel("viewModel").setProperty("/currentFlow", sKey);
            // Aggiorna la FilterBar per ridisegnarsi
            this.oFilterBar.invalidate();
            this.oFilterBar.rerender();
        },


        onElaborazioneChange: function (oEvent) {
            var i = oEvent.getSource().getSelectedIndex();
            var bEnable = (i === 3 || i === 4);
            this.byId("rbRinomina").setEnabled(bEnable);
            this.byId("rbMantieni").setEnabled(bEnable);
        },

        onCartellaChange: function () {
            var bIsServer = this.byId("rbServer").getSelected();
            this.byId("idPercorsoInput").setEnabled(bIsServer);
        },

        onViewXML: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("fattureModel");
            var sXmlContent = oContext ? oContext.getProperty("XmlContent") : "<xml/>";

            var oCodeEditor = new sap.ui.codeeditor.CodeEditor({
                type: "xml",
                value: sXmlContent,
                height: "400px",
                width: "100%",
                editable: false,
                lineNumbers: true,
                syntaxHints: true
            });

            var oDialog = new sap.m.Dialog({
                title: "Visualizza XML",
                contentWidth: "80%",
                contentHeight: "60%",
                resizable: true,
                draggable: true,
                content: [oCodeEditor],
                buttons: [
                    new sap.m.Button({
                        text: "Salva",
                        type: "Emphasized",
                        press: function () {
                            var oNameInput = new sap.m.Input({ placeholder: "Nome file", value: "fattura.xml" });
                            var oPopup = new sap.m.Dialog({
                                title: "Salva come...",
                                content: [oNameInput],
                                beginButton: new sap.m.Button({
                                    text: "Conferma",
                                    type: "Emphasized",
                                    press: function () {
                                        var sFileName = oNameInput.getValue() || "file.xml";
                                        var sContent = oCodeEditor.getValue();
                                        var blob = new Blob([sContent], { type: "application/xml" });
                                        var link = document.createElement("a");
                                        link.href = window.URL.createObjectURL(blob);
                                        link.download = sFileName;
                                        link.click();
                                        oPopup.close();
                                    }
                                }),
                                endButton: new sap.m.Button({
                                    text: "Annulla",
                                    press: function () { oPopup.close(); }
                                }),
                                afterClose: function () { oPopup.destroy(); }
                            });
                            oPopup.open();
                        }
                    }),
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
            // ✅ Usa il binding context corretto (mainService)
            const oContext = oEvent.getSource().getBindingContext("mainService");
            if (!oContext) {
                sap.m.MessageToast.show("Impossibile determinare il contesto della riga selezionata.");
                return;
            }

            const oData = oContext.getObject();
            const sFlow = this.getView().getModel("viewModel").getProperty("/currentFlow"); // "sd" o "fi"
            const oDataModel = this.getOwnerComponent().getModel("mainService"); // ✅ OData principale

            let sPath = "";

            // === FLUSSO SD ===
            if (sFlow === "sd") {
                const sBillingDocument = oData.vbeln; // ✅ campo corretto OData
                if (!sBillingDocument) {
                    sap.m.MessageToast.show("Numero documento mancante (vbeln).");
                    return;
                }
                // ✅ costruisci dinamicamente il path per la function import
                sPath = `/ZEIM_GetPDFBillingDocument('${sBillingDocument}')`;
            }

            // === FLUSSO FI ===
            else if (sFlow === "fi") {
                const sBukrs = oData.bukrs;
                const sBelnr = oData.belnr;
                const sGjahr = oData.gjahr;

                if (!sBukrs || !sBelnr || !sGjahr) {
                    sap.m.MessageBox.warning("Dati incompleti per la chiamata PDF FI (bukrs/belnr/gjahr mancanti).");
                    return;
                }

                // ✅ path dinamico
                sPath = `/ZEIM_GetPDFAccountingDocument(bukrs='${sBukrs}',belnr='${sBelnr}',gjahr='${sGjahr}')`;
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

                // ✅ Creazione iframe per anteprima PDF
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

            let aFilters = [];

            switch (sKey) {
                case "Processed":
                    aFilters.push(new sap.ui.model.Filter("esito", sap.ui.model.FilterOperator.Contains, "Processato"));
                    break;
                case "Working":
                    aFilters.push(new sap.ui.model.Filter("esito", sap.ui.model.FilterOperator.Contains, "Da processare"));
                    break;
                case "Error":
                    aFilters.push(new sap.ui.model.Filter("esito", sap.ui.model.FilterOperator.Contains, "Errore"));
                    break;
                case "All":
                default:
                    break;
            }

            oBinding.filter(aFilters);

            // Aggiorna anche i conteggi ogni volta che si cambia tab
            this._updateCounts();
        },



        onSelectionChange: function (oEvent) {
            var oTable = this.byId("idTableFatture");
            var aSelected = oTable.getSelectedItems();
            this.byId("btnCreateXML").setEnabled(aSelected.length > 0);
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


            /**
 * Formatter per la data budat
 * Converte "2025-10-17T00:00:00" → "17/10/2025"
 */
            formatDate: function (sDate) {
                if (!sDate) return "";
                const oDate = new Date(sDate);
                const oFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd/MM/yyyy" });
                return oFormat.format(oDate);
            }
        },




        onNavToCliente: async function (oEvent) {
            try {
                const oContext = oEvent.getSource().getBindingContext("mainService");
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

                const Navigation = await sap.ushell.Container.getServiceAsync("Navigation");

                const sHref = await Navigation.getHref({
                    target: {
                        semanticObject: "Customer",
                        action: "manage"
                    },
                    params: {
                        Customer: sKunnr
                    }
                });

                console.log(" Navigazione FLP:", sHref);

                window.open(sHref, "_blank");
            } catch (err) {
                console.error("Errore nella navigazione Cross-App:", err);
                sap.m.MessageBox.error("Impossibile aprire l'app Customer - Manage.");
            }
        },


        onNavToDocumento: async function (oEvent) {
            try {
                const oContext = oEvent.getSource().getBindingContext("mainService");
                if (!oContext) {
                    sap.m.MessageToast.show("Impossibile determinare il cliente selezionato.");
                    return;
                }

                const oData = oContext.getObject();
                const belnr = oData.belnr;
                const bukrs = oData.bukrs;
                const gjahr = oData.gjahr
                if (!sKunnr) {
                    sap.m.MessageToast.show("Nr documento non disponibile.");
                    return;
                }

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
                sap.m.MessageBox.error("Impossibile aprire l'app Customer - Manage.");
            }
        }







    });
});
