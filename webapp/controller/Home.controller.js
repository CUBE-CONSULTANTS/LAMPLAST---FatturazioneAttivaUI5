sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/codeeditor/CodeEditor",
    "sap/ui/core/Fragment",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/ui/core/BusyIndicator"
], function (Controller, CodeEditor, Fragment, Dialog, Button, BusyIndicator) {
    "use strict";

    return Controller.extend("com.zeim.fatturazioneattiva.controller.Home", {

        onInit: function () {
            // Inizializza i contatori quando viene caricato il controller
            this._updateCounts();

            var oViewModel = new sap.ui.model.json.JSONModel({
                currentFlow: "sd"
            });
            this.getView().setModel(oViewModel, "viewModel");

            this.oFilterBar = this.byId("filterBar");

            this._filters = {
                societa: new sap.ui.mdc.FilterField({ propertyKey: "societa", label: "Società", conditions: "{$filters>/societa}" }),
                numeroFattura: new sap.ui.mdc.FilterField({ propertyKey: "numeroFattura", label: "Numero Fattura", conditions: "{$filters>/numeroFattura}" }),
                paese: new sap.ui.mdc.FilterField({ propertyKey: "paese", label: "Paese dell'Esec.Pag.", conditions: "{$filters>/paese}" }),
                cliente: new sap.ui.mdc.FilterField({ propertyKey: "cliente", label: "Cliente", conditions: "{$filters>/cliente}" }),
                orgComm: new sap.ui.mdc.FilterField({ propertyKey: "orgComm", label: "Org. Commerciale", conditions: "{$filters>/orgComm}" }),
                dataDoc: new sap.ui.mdc.FilterField({ propertyKey: "dataDoc", label: "Data Doc. fatt.", conditions: "{$filters>/dataDoc}" }),
                tipoFattura: new sap.ui.mdc.FilterField({ propertyKey: "tipoFattura", label: "Tipo Fattura", conditions: "{$filters>/tipoFattura}" })
            };

            this._filterOrder = [
                this._filters.societa,
                this._filters.numeroFattura,
                this._filters.paese,
                this._filters.cliente,
                this._filters.orgComm,
                this._filters.dataDoc,
                this._filters.tipoFattura
            ];

            // aggiungo tutti i campi una sola volta
            Object.values(this._filters).forEach(f => this.oFilterBar.addFilterItem(f));
        },

        onAfterRendering: function () {
            // Aggiungi qui il codice da eseguire dopo il rendering della vista

            var oFilter = this.getView().byId("filterBar")
            oFilter._btnSearch.setText("Avvio")
        },

        _updateCounts: function () {
            // Recupera il modello delle fatture
            var oModel = this.getOwnerComponent().getModel("fattureModel");
            var aFatture = oModel.getProperty("/Fatture");

            // Calcola i contatori
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

            // Aggiorna il modello con i contatori
            oModel.setProperty("/Counts", oCounts);
        },

        onSegmentChange: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();

            if (sKey === "sd") {
                this._filterOrder.forEach((f, idx) => {
                    if (this.oFilterBar.getFilterItems().indexOf(f) === -1) {
                        this.oFilterBar.insertFilterItem(f, idx);
                    }
                });
            } else if (sKey === "fi") {
                // Rimuovo Società e Org.Comm se sono presenti
                if (this.oFilterBar.getFilterItems().indexOf(this._filters.societa) !== -1) {
                    this.oFilterBar.removeFilterItem(this._filters.societa);
                }
                if (this.oFilterBar.getFilterItems().indexOf(this._filters.orgComm) !== -1) {
                    this.oFilterBar.removeFilterItem(this._filters.orgComm);
                }
            }

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
                            // popup per chiedere il nome file
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

                                        // Creazione blob per download
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
                                    type: "Default",
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
            // Recupera contesto della riga selezionata
            var oContext = oEvent.getSource().getBindingContext("fattureModel");
            var sPdfBase64 = oContext ? oContext.getProperty("PdfBase64") : null;

            if (!sPdfBase64) {
                sap.m.MessageToast.show("Nessun PDF disponibile");
                return;
            }

            // Costruisci URL data URI
            var pdfDataUrl = "data:application/pdf;base64," + sPdfBase64;

            // Contenuto iframe
            var oIframe = new sap.ui.core.HTML({
                content: "<iframe src='" + pdfDataUrl + "' width='100%' height='700px' style='border:none;'></iframe>"
            });

            // Crea il Dialog
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

                // download singolo file
                var blob = new Blob([sXmlContent], { type: "application/xml" });
                var link = document.createElement("a");
                link.href = window.URL.createObjectURL(blob);
                link.download = sFileName;
                link.click();
            });
        },









    });
});
