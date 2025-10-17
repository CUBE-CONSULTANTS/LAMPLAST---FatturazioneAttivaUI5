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

            this.byId("multiInput").addValidator(this._onMultiInputValidate.bind(this));

            var oViewModel = new sap.ui.model.json.JSONModel({
                currentFlow: "sd"
            });
            this.getView().setModel(oViewModel, "viewModel");

            this.oFilterBar = this.byId("filterBar");
        },

        onValueHelpRequestedClienti: function () {
            this._oBasicSearchField = new SearchField({
                width: "100%",
                liveChange: function (oEvent) {
                    var sValue = oEvent.getParameter("newValue");
                    this._applyCustomerFilter(sValue);
                }.bind(this)
            });

            this.loadFragment({
                name: "com.zeim.fatturazioneattiva.view.fragments.ValueHelpDialogFilterbarClienti"
            }).then(function (oDialog) {
                var oFilterBar = oDialog.getFilterBar();
                this._oVHD = oDialog;
                this.getView().addDependent(oDialog);

                oDialog.setRangeKeyFields([{
                    label: "Customer",
                    key: "Customer",
                    type: "string"
                }]);

                oDialog.setKey("Customer");
                oDialog.setDescriptionKey("OrganizationBPName1");
                oDialog.setTokenDisplayBehaviour(sap.ui.comp.smartfilterbar.DisplayBehaviour.descriptionAndId);

                oFilterBar.setFilterBarExpanded(false);
                oFilterBar.setBasicSearch(this._oBasicSearchField);

                // Gestione evento "search" del FilterBar
                oFilterBar.attachSearch(this.onFilterBarSearch.bind(this));

                oDialog.getTableAsync().then(function (oTable) {
                    const oCustomerModel = this.getOwnerComponent().getModel("Clienti");
                    oTable.setModel(oCustomerModel);

                    if (oTable.bindRows) {
                        oTable.bindAggregation("rows", {
                            path: "/I_Customer_VH",
                            events: {
                                dataReceived: function () {
                                    oDialog.update();
                                }
                            }
                        });

                        oTable.addColumn(new UIColumn({
                            label: new Label({ text: "Cliente" }),
                            template: new Text({ text: "{Customer}" })
                        }));
                        oTable.addColumn(new UIColumn({
                            label: new Label({ text: "Descrizione" }),
                            template: new Text({ text: "{OrganizationBPName1}" })
                        }));
                        oTable.addColumn(new UIColumn({
                            label: new Label({ text: "Città" }),
                            template: new Text({ text: "{CityName}" })
                        }));
                    }

                    oDialog.update();
                }.bind(this));

                // Imposta i token già presenti
                var aCurrentTokens = this.byId("multiInput").getTokens();
                oDialog.setTokens(aCurrentTokens);

                oDialog.attachAfterOpen(function () {
                    oFilterBar.search();
                });

                oDialog.open();
            }.bind(this));
        },


        _applyCustomerFilter: function (sQuery) {
            var oDialog = this._oVHD;
            if (!oDialog) return;

            oDialog.getTableAsync().then(function (oTable) {
                var oBinding = oTable.bindRows ? oTable.getBinding("rows") : oTable.getBinding("items");
                if (!oBinding) return;

                var aFilters = [];
                if (sQuery && sQuery.trim()) {
                    var aInnerFilters = [
                        new sap.ui.model.Filter("OrganizationBPName1", sap.ui.model.FilterOperator.Contains, sQuery),
                        new sap.ui.model.Filter("CityName", sap.ui.model.FilterOperator.Contains, sQuery)
                    ];


                    if (sQuery.length <= 10) {
                        aInnerFilters.push(
                            new sap.ui.model.Filter("Customer", sap.ui.model.FilterOperator.Contains, sQuery)
                        );
                    }

                    aFilters.push(new sap.ui.model.Filter({
                        filters: aInnerFilters,
                        and: false
                    }));
                }

                oBinding.filter(aFilters);
                oDialog.update();
            });
        },


        _onMultiInputValidate: function (oArgs) {
            const oSuggestion = oArgs.suggestionObject;

            if (!oSuggestion || !oSuggestion.getBindingContext) {
                return new sap.m.Token({
                    key: oArgs.text,
                    text: oArgs.text
                });
            }

            const oContext = oSuggestion.getBindingContext("Clienti");
            if (!oContext) {
                return new sap.m.Token({
                    key: oArgs.text,
                    text: oArgs.text
                });
            }

            const oObj = oContext.getObject();
            if (!oObj.Customer || !oObj.OrganizationBPName1) {
                return new sap.m.Token({
                    key: oArgs.text,
                    text: oArgs.text
                });
            }

            return new sap.m.Token({
                key: oObj.Customer,
                text: `${oObj.OrganizationBPName1} (${oObj.Customer})`
            });
        },


        onFilterBarSearch: function (oEvent) {
            var oFilterBar = oEvent.getSource();

            // Recupera i valori dei campi della filterbar
            var sCustomer = oFilterBar.determineControlByName("Customer")?.getValue().trim() || "";
            var sDescription = oFilterBar.determineControlByName("OrganizationBPName1")?.getValue().trim() || "";
            var sCity = oFilterBar.determineControlByName("CityName")?.getValue().trim() || "";

            // Recupera anche il valore della ricerca libera (campo "Cerca")
            var sBasicSearch = this._oBasicSearchField?.getValue().trim() || "";

            // Crea un'unica query combinata
            var sQuery = sBasicSearch || sDescription || sCustomer || sCity;
            this._applyCustomerFilter(sQuery);
        },

        onValueHelpOkPress: function (oEvent) {
            var aTokens = oEvent.getParameter("tokens");
            this._oMultiInput.setTokens(aTokens);
            this._oVHD.close();
        },

        onValueHelpCancelPress: function () {
            this._oVHD.close();
        },

        onValueHelpAfterClose: function () {
            this._oVHD.destroy();
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
            var sKey = oEvent.getParameter("item").getKey();

            if (sKey === "sd") {
                this._filterOrder.forEach((f, idx) => {
                    if (this.oFilterBar.getFilterItems().indexOf(f) === -1) {
                        this.oFilterBar.insertFilterItem(f, idx);
                    }
                });
            } else if (sKey === "fi") {
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
        }
    });
});
