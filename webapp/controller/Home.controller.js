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
            this._updateCounts();

            var oMultiInput = this.byId("multiInput");
            this._oMultiInput = oMultiInput;

            //this.byId("multiInput").addValidator(this._onMultiInputValidate.bind(this));

            var oViewModel = new sap.ui.model.json.JSONModel({
                currentFlow: "sd"
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

        },

        _updateCounts: function () {
            var oModel = this.getOwnerComponent().getModel("fattureModel");
            var aFatture = oModel.getProperty("/Fatture");

            var oCounts = {
                All: aFatture.length,
                Processed: aFatture.filter(function (fattura) {
                    return fattura.LogState === "Success";
                }).length,
                Working: aFatture.filter(function (fattura) {
                    return fattura.LogState === "Warning";
                }).length,
                Error: aFatture.filter(function (fattura) {
                    return fattura.LogState === "Error";
                }).length
            };

            oModel.setProperty("/Counts", oCounts);
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

        onShowAdvancedPDFDialog: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("fattureModel");
            var sPdfBase64 = oContext ? oContext.getProperty("PdfBase64") : null;

            if (!sPdfBase64) {
                sap.m.MessageToast.show("Nessun PDF disponibile");
                return;
            }

            var pdfDataUrl = "data:application/pdf;base64," + sPdfBase64;
            var oIframe = new sap.ui.core.HTML({
                content: "<iframe src='" + pdfDataUrl + "' width='100%' height='700px' style='border:none;'></iframe>"
            });

            var oDialog = new sap.m.Dialog({
                title: "Visualizza PDF",
                contentWidth: "90%",
                contentHeight: "100%",
                resizable: true,
                draggable: true,
                content: [oIframe],
                beginButton: new sap.m.Button({
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
        },

        onIconTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            var oTable = this.byId("idTableFatture");
            var oBinding = oTable.getBinding("items");
            var aFilters = [];

            if (sKey === "processed") {
                aFilters.push(new sap.ui.model.Filter("LogState", "EQ", "Success"));
            } else if (sKey === "working") {
                aFilters.push(new sap.ui.model.Filter("LogState", "EQ", "Warning"));
            } else if (sKey === "error") {
                aFilters.push(new sap.ui.model.Filter("LogState", "EQ", "Error"));
            }
            oBinding.filter(aFilters);
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
                    "/I_Customer_VH",
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
        }




    });
});
